// Private chat core: end-to-end encryption with NO server.
// Everything runs on the phone with the browser's built-in, audited WebCrypto:
//   ECDH P-256 (key agreement) -> HKDF-SHA-256 (per-message key) -> AES-256-GCM (encrypt + authenticate).
// Private keys are stored as NON-extractable CryptoKeys in IndexedDB, so even the app's own code cannot read them out.
// Messages travel as plain text ("CATSEC1:...") through any app the user chooses. Nothing is ever sent by this file.
(function () {
  var enc = new TextEncoder(), dec = new TextDecoder();
  var subtle = (window.crypto && window.crypto.subtle) || null;
  var PREFIX = "CATSEC1:", PAIR = "CATPAIR1:";

  /* ---------- small helpers ---------- */
  function b64u(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64u(str) {
    str = String(str).replace(/[^A-Za-z0-9_\-]/g, "");
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    var s = atob(str), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function rnd(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }
  function concat() {
    var len = 0, i; for (i = 0; i < arguments.length; i++) len += arguments[i].length;
    var out = new Uint8Array(len), o = 0;
    for (i = 0; i < arguments.length; i++) { out.set(arguments[i], o); o += arguments[i].length; }
    return out;
  }
  function sha(bytes) { return subtle.digest("SHA-256", bytes).then(function (d) { return new Uint8Array(d); }); }
  function fidOf(pubRaw) { return sha(pubRaw).then(function (h) { return hex(h.slice(0, 8)); }); }
  function fromHex(h) { var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
  function cleanName(n) { return String(n || "").replace(/[\n\r\t]+/g, " ").trim().slice(0, 24); }

  /* ---------- IndexedDB ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open("cat-private-chat", 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        d.createObjectStore("friends", { keyPath: "id" });
        var m = d.createObjectStore("msgs", { keyPath: "mid" });
        m.createIndex("fid", "fid", { unique: false });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode), s = t.objectStore(store), out = fn(s);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function getAll(store) { return tx(store, "readonly", function (s) { return s.getAll(); }); }
  function put(store, v) { return tx(store, "readwrite", function (s) { return s.put(v); }); }
  function del(store, k) { return tx(store, "readwrite", function (s) { return s.delete(k); }); }

  /* ---------- identity (display name shown to friends) ---------- */
  function myName() { try { return localStorage.getItem("pchat.name") || ""; } catch (e) { return ""; } }
  function setMyName(n) { try { localStorage.setItem("pchat.name", cleanName(n)); } catch (e) {} }

  /* ---------- pairing ---------- */
  // A "pending" friend holds a fresh key pair whose public half is handed out as the pairing code.
  function newKeyPair() {
    return subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]).then(function (kp) {
      return subtle.exportKey("raw", kp.publicKey).then(function (raw) { return { priv: kp.privateKey, pub: new Uint8Array(raw) }; });
    });
  }
  function pairingText(pub, name) {
    return PAIR + b64u(pub) + "." + b64u(enc.encode(cleanName(name) || "Friend"));
  }
  function parsePairing(text) {
    var m = /CATPAIR1:([A-Za-z0-9_\-]+)\.([A-Za-z0-9_\-]*)/.exec(String(text || ""));
    if (!m) return null;
    try {
      var pub = unb64u(m[1]);
      if (pub.length !== 65 || pub[0] !== 4) return null;
      return { pub: pub, name: cleanName(dec.decode(unb64u(m[2]))) };
    } catch (e) { return null; }
  }
  function deriveRoot(priv, theirPub) {
    return subtle.importKey("raw", theirPub, { name: "ECDH", namedCurve: "P-256" }, false, []).then(function (pk) {
      return subtle.deriveBits({ name: "ECDH", public: pk }, priv, 256);
    }).then(function (bits) { return subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]); });
  }

  // The code I show to a friend. Re-uses an unused pending pairing so reopening the screen doesn't churn keys.
  function myCode(forceNew) {
    return getAll("friends").then(function (all) {
      var p = all.filter(function (f) { return f.pending; })[0];
      if (p && !forceNew) return p;
      var drop = forceNew && p ? del("friends", p.id) : Promise.resolve();
      return drop.then(newKeyPair).then(function (kp) {
        return fidOf(kp.pub).then(function (fid) {
          var rec = { id: fid, pending: true, myPriv: kp.priv, myPub: kp.pub, created: Date.now() };
          return put("friends", rec).then(function () { return rec; });
        });
      });
    }).then(function (rec) { return { text: pairingText(rec.myPub, myName()), id: rec.id }; });
  }

  // I have their code: create a complete friend. (Their app learns about me from my first message.)
  function addFriendFromCode(text, nameOverride) {
    var p = parsePairing(text);
    if (!p) return Promise.reject(new Error("That doesn't look like a friend code."));
    return getAll("friends").then(function (all) {
      return fidOf(p.pub).then(function (theirFid) {
        var dup = all.filter(function (f) { return !f.pending && f.theirFid === theirFid; })[0];
        if (dup) return dup;
        return newKeyPair().then(function (kp) {
          return Promise.all([deriveRoot(kp.priv, p.pub), fidOf(kp.pub)]).then(function (r) {
            var rec = { id: r[1], pending: false, name: cleanName(nameOverride || p.name) || "Friend", myPriv: kp.priv, myPub: kp.pub, theirPub: p.pub, theirFid: theirFid, root: r[0],
              confirmed: true, knowsMe: false, created: Date.now(), seen: [] };
            return put("friends", rec).then(function () { return rec; });
          });
        });
      });
    });
  }
  function listFriends() { return getAll("friends").then(function (a) { return a.filter(function (f) { return !f.pending; }); }); }
  function getFriend(id) { return tx("friends", "readonly", function (s) { return s.get(id); }); }
  function renameFriend(id, name) { return getFriend(id).then(function (f) { if (f) { f.name = cleanName(name) || f.name; return put("friends", f); } }); }
  function confirmFriend(id) { return getFriend(id).then(function (f) { if (f) { f.confirmed = true; return put("friends", f); } }); }
  function removeFriend(id) {
    return getAll("msgs").then(function (all) {
      return Promise.all(all.filter(function (m) { return m.fid === id; }).map(function (m) { return del("msgs", m.mid); }));
    }).then(function () { return del("friends", id); });
  }

  // Safety number: both people see the same 25 digits. Reading it out loud (call, in person) proves nobody swapped the codes.
  function safetyNumber(f) {
    var a = f.myPub, b = f.theirPub, i, cmp = 0;
    for (i = 0; i < 65 && !cmp; i++) cmp = a[i] - b[i];
    var first = cmp < 0 ? a : b, second = cmp < 0 ? b : a;
    return sha(concat(enc.encode("catsec-safety"), first, second)).then(function (h) {
      var out = [];
      for (var g = 0; g < 5; g++) {
        var n = ((h[g * 3] << 16) | (h[g * 3 + 1] << 8) | h[g * 3 + 2]) % 100000;
        out.push(("00000" + n).slice(-5));
      }
      return out.join(" ");
    });
  }

  /* ---------- encrypt / decrypt ---------- */
  function msgKey(root, salt, sFid, rFid) {
    return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: salt, info: enc.encode("catsec1:" + sFid + ">" + rFid) },
      root, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  function gzip(bytes) {
    if (typeof CompressionStream === "undefined") return Promise.resolve(null);
    var cs = new CompressionStream("gzip"), w = cs.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(cs.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }, function () { return null; });
  }
  function gunzip(bytes) {
    if (typeof DecompressionStream === "undefined") return Promise.reject(new Error("This phone can't open compressed messages."));
    var ds = new DecompressionStream("gzip"), w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function newId() { return hex(rnd(8)); }

  // body: { k:"m", text } | { k:"e", entry } | { k:"l", name, category, items }
  function encrypt(friend, body) {
    var msg = Object.assign({ i: newId(), t: Date.now() }, body);
    if (!friend.knowsMe) msg.n = myName();
    var json = JSON.stringify(msg);
    var pad = (128 - (enc.encode(json).length % 128)) % 128;
    var plain = enc.encode(json + new Array(pad + 1).join(" "));
    return gzip(plain).then(function (z) {
      var useZ = !!z && z.length < plain.length;
      var data = useZ ? z : plain;
      var salt = rnd(16), iv = rnd(12);
      var hello = !friend.knowsMe;
      return Promise.all([fidOf(friend.myPub), fidOf(friend.theirPub)]).then(function (f) {
        var sFid = f[0], rFid = f[1];
        var head = hello
          ? concat(new Uint8Array([2, useZ ? 1 : 0]), fromHex(rFid), friend.myPub, salt, iv)
          : concat(new Uint8Array([1, useZ ? 1 : 0]), fromHex(sFid), salt, iv);
        return msgKey(friend.root, salt, sFid, rFid).then(function (key) {
          return subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: head, tagLength: 128 }, key, data);
        }).then(function (ct) { return { text: PREFIX + b64u(concat(head, new Uint8Array(ct))), id: msg.i, ts: msg.t }; });
      });
    });
  }

  function findEnvelope(text) {
    var m = /CATSEC1:([A-Za-z0-9_\-]{40,})/.exec(String(text || ""));
    return m ? m[1] : null;
  }
  function looksEncrypted(text) { return !!findEnvelope(text); }

  // Open a pasted message. Resolves { friend, msg } or rejects with an Error whose .code is
  // "none" | "bad" | "dup" | "nofriend" | "used" | "old".
  function fail(code, text) { var e = new Error(text); e.code = code; return Promise.reject(e); }
  function decrypt(text) {
    var env = findEnvelope(text);
    if (!env) return fail("none", "No private message found in that text.");
    var b;
    try { b = unb64u(env); } catch (e) { return fail("bad", "That message is damaged."); }
    if (b.length < 40) return fail("bad", "That message is damaged (it may have been cut short when copied).");
    var type = b[0], flags = b[1], z = flags & 1;
    if (type !== 1 && type !== 2) return fail("old", "This message was made by a newer version of the app.");
    return getAll("friends").then(function (all) {
      var friend, head, salt, iv, ct, sFid, rFid, theirPub = null, off;
      if (type === 1) {
        sFid = hex(b.slice(2, 10)); off = 10;
        friend = all.filter(function (f) { return !f.pending && f.theirFid === sFid; })[0];
        if (!friend) return fail("nofriend", "This message is from someone you haven't added yet.");
        rFid = null;
      } else {
        rFid = hex(b.slice(2, 10)); theirPub = b.slice(10, 75); off = 75;
        if (b.length < off + 28 + 16) return fail("bad", "That message is damaged.");
        friend = all.filter(function (f) { return f.id === rFid; })[0];
        if (!friend) return fail("nofriend", "This message wasn't meant for any code you have shown.");
      }
      salt = b.slice(off, off + 16); iv = b.slice(off + 16, off + 28); ct = b.slice(off + 28);
      head = b.slice(0, off + 28);
      var setup;
      if (type === 2) {
        if (!friend.pending) {
          // an already-paired friend resending a hello is fine; anyone else using a used code is refused
          return fidOf(theirPub).then(function (tf) {
            if (tf !== friend.theirFid) return fail("used", "That code was already used by someone else.");
            return { friend: friend, theirPub: theirPub, sFid: tf, rFid: friend.id, fresh: false };
          });
        }
        return fidOf(theirPub).then(function (tf) { return { friend: friend, theirPub: theirPub, sFid: tf, rFid: friend.id, fresh: true }; });
      }
      return fidOf(friend.myPub).then(function (mine) { return { friend: friend, theirPub: friend.theirPub, sFid: sFid, rFid: mine, fresh: false }; });
    }).then(function (ctx) {
      var friend = ctx.friend;
      var rootP = ctx.fresh ? deriveRoot(friend.myPriv, ctx.theirPub) : Promise.resolve(friend.root);
      return rootP.then(function (root) {
        return msgKey(root, salt0(b, type), ctx.sFid, ctx.rFid).then(function (key) {
          var off = type === 1 ? 10 : 75;
          var head = b.slice(0, off + 28), iv = b.slice(off + 16, off + 28), ct = b.slice(off + 28);
          return subtle.decrypt({ name: "AES-GCM", iv: iv, additionalData: head, tagLength: 128 }, key, ct);
        }).then(function (plain) {
          return { root: root, plain: new Uint8Array(plain), ctx: ctx };
        }, function () { return fail("bad", "Couldn't unlock this message. It may be damaged, or not meant for you."); });
      });
    }).then(function (r) {
      return (z ? gunzip(r.plain) : Promise.resolve(r.plain)).then(function (plain) {
        var msg; try { msg = JSON.parse(dec.decode(plain)); } catch (e) { return fail("bad", "That message is damaged."); }
        var friend = r.ctx.friend;
        if (r.ctx.fresh) {
          // first contact: complete the pending pairing. The person must confirm it (safety number) before trusting it.
          friend.pending = false; friend.theirPub = r.ctx.theirPub; friend.theirFid = r.ctx.sFid; friend.root = r.root;
          friend.name = cleanName(msg.n) || "New friend"; friend.confirmed = false; friend.knowsMe = true; friend.seen = [];
        }
        friend.seen = friend.seen || [];
        if (friend.seen.indexOf(msg.i) >= 0) return fail("dup", "You already received this message.");
        friend.seen.push(msg.i); if (friend.seen.length > 4000) friend.seen = friend.seen.slice(-3000);
        friend.knowsMe = true;                       // they know me, so I can stop attaching my key to messages
        if (msg.n && !r.ctx.fresh && (!friend.name || friend.name === "Friend")) friend.name = cleanName(msg.n);
        var rec = { mid: friend.id + "|" + String(msg.t || Date.now()) + "|" + msg.i, fid: friend.id, dir: "in", ts: msg.t || Date.now(), body: stripMeta(msg), id: msg.i };
        return put("friends", friend).then(function () { return put("msgs", rec); }).then(function () { return { friend: friend, msg: rec, firstContact: !!r.ctx.fresh }; });
      });
    });
  }
  function salt0(b, type) { var off = type === 1 ? 10 : 75; return b.slice(off, off + 16); }
  function stripMeta(m) { var o = {}; for (var k in m) if (k !== "n" && k !== "i" && k !== "t") o[k] = m[k]; return o; }

  /* ---------- conversations ---------- */
  // Make a message for a friend and keep it in the conversation.
  function send(friendId, body) {
    return getFriend(friendId).then(function (f) {
      return encrypt(f, body).then(function (e) {
        var rec = { mid: f.id + "|" + e.ts + "|" + e.id, fid: f.id, dir: "out", ts: e.ts, body: body, id: e.id, wire: e.text };
        return put("msgs", rec).then(function () { return { msg: rec, text: e.text, friend: f }; });
      });
    });
  }
  function messages(friendId) {
    return getAll("msgs").then(function (all) {
      return all.filter(function (m) { return m.fid === friendId; }).sort(function (a, b) { return a.ts - b.ts; });
    });
  }
  function allMessages() { return getAll("msgs"); }
  function deleteMessage(mid) { return del("msgs", mid); }
  function markSaved(mid) { return tx("msgs", "readonly", function (s) { return s.get(mid); }).then(function (m) { if (m) { m.saved = true; return put("msgs", m); } }); }
  function markRead(friendId, ts) { try { localStorage.setItem("pchat.read." + friendId, String(ts || Date.now())); } catch (e) {} }
  function lastRead(friendId) { try { return Number(localStorage.getItem("pchat.read." + friendId)) || 0; } catch (e) { return 0; } }

  window.PChat = {
    supported: !!subtle && !!window.indexedDB,
    PREFIX: PREFIX, PAIR: PAIR,
    myName: myName, setMyName: setMyName,
    myCode: myCode, parsePairing: parsePairing, addFriendFromCode: addFriendFromCode,
    listFriends: listFriends, getFriend: getFriend, renameFriend: renameFriend, confirmFriend: confirmFriend, removeFriend: removeFriend,
    safetyNumber: safetyNumber, looksEncrypted: looksEncrypted, decrypt: decrypt, send: send,
    messages: messages, allMessages: allMessages, deleteMessage: deleteMessage, markSaved: markSaved, markRead: markRead, lastRead: lastRead
  };
})();
