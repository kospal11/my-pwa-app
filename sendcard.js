// Send an entry or a list to a friend as a picture card + a line of text the friend's My Cat App can import.
// No server and no account: the card is drawn on the phone and handed to the share sheet (WhatsApp, Viber, ...).
(function () {
  var enc = new TextEncoder(), dec = new TextDecoder();
  var PFX = { e: "CATENTRY1:", l: "CATLIST1:" };
  var DROP = ["id", "remindAt", "reminded", "checked", "checkedAt", "dateAdded", "lastWatchedAt", "children", "index", "note", "dateVisited", "tvStatus"];

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function nameOf(e) { return e.placeName || e.movieName || e.otherName || e.name || "Entry"; }
  function subOf(e) { return e.genre || e.cinemaName || e.cuisineType || e.drinkType || e.otherType || ""; }
  function toast(m) { if (window.Share && Share.toast) Share.toast(m); }
  function myName() { try { return localStorage.getItem("pchat.name") || ""; } catch (e) { return ""; } }
  function b64u(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64u(str) { str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "="; var s = atob(str), b = new Uint8Array(s.length); for (var i = 0; i < b.length; i++) b[i] = s.charCodeAt(i); return b; }
  function clean(e) { var o = {}; for (var k in e) if (DROP.indexOf(k) < 0 && e[k] !== "" && e[k] != null) o[k] = e[k]; return o; }
  function stream(kind, bytes) {
    var S = kind === "z" ? window.CompressionStream : window.DecompressionStream;
    if (!S) return Promise.resolve(null);
    var s = new S("gzip"), w = s.writable.getWriter(); w.write(bytes); w.close();
    return new Response(s.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); }, function () { return null; });
  }

  /* ---------- the text payload ---------- */
  // "z" + gzip when it helps, else "j" + plain JSON; both base64url so chat apps leave them alone.
  function pack(obj) {
    var raw = enc.encode(JSON.stringify(obj));
    return stream("z", raw).then(function (z) {
      return z && z.length < raw.length ? "z" + b64u(z) : "j" + b64u(raw);
    });
  }
  function unpack(s) {
    var mode = s.charAt(0), b;
    try { b = unb64u(s.slice(1)); } catch (e) { return Promise.reject(new Error("bad")); }
    var raw = mode === "z" ? stream("d", b) : Promise.resolve(b);
    return raw.then(function (r) { if (!r) throw new Error("bad"); return JSON.parse(dec.decode(r)); });
  }
  function findPayload(text) {
    var m = /CAT(ENTRY|LIST)1:([zj][A-Za-z0-9_\-]{8,})/.exec(String(text || ""));
    return m ? { kind: m[1] === "ENTRY" ? "e" : "l", data: m[2] } : null;
  }
  function parse(text) {
    var f = findPayload(text); if (!f) return Promise.resolve(null);
    return unpack(f.data).then(function (o) { o.k = f.kind; return o; }, function () { return null; });
  }

  /* ---------- importing what a friend sent ---------- */
  function same(a, b) { return (a.type || "") === (b.type || "") && nameOf(a).toLowerCase() === nameOf(b).toLowerCase(); }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "e" + Date.now() + Math.random().toString(16).slice(2); }
  function addEntry(all, src) {
    var hit = all.filter(function (x) { return same(x, src); })[0];
    if (hit) return { entry: hit, isNew: false };
    var e = clean(src); e.id = uid(); e.checked = false; e.dateAdded = new Date().toISOString();
    all.push(e); return { entry: e, isNew: true };
  }
  function lookupFor(list) {
    if (!window.Lookup || !Lookup.bulkRun) return;
    var movies = list.filter(function (e) { return e.type === "Cinema"; });
    if (movies.length) setTimeout(function () { try { Lookup.bulkRun(movies, { delay: 0, concurrency: 1, includeMissed: true }); } catch (e) {} }, 300);
  }
  function refreshApp() {
    try { entries = lsGet("entries") || []; } catch (e) {}
    ["renderRecent", "updateTileCounts", "renderContinue", "renderUpcoming"].forEach(function (f) { try { if (typeof window[f] === "function") window[f](); } catch (e) {} });
  }
  // Returns { status: "added"|"existed"|"list", name, count }
  function importPayload(p) {
    var all = lsGet("entries") || [];
    if (p.k === "e" && p.entry) {
      var r = addEntry(all, p.entry);
      if (r.isNew) { lsSet("entries", all); lookupFor([r.entry]); refreshApp(); }
      return { status: r.isNew ? "added" : "existed", name: nameOf(r.entry) };
    }
    if (p.k === "l" && p.items) {
      var lists = lsGet("lists") || {}, n = p.name || "Shared list", u = n, i = 2;
      while (lists[u]) u = n + " (" + i++ + ")";
      var items = [], fresh = [];
      p.items.forEach(function (it) { var r = addEntry(all, it); if (r.isNew) fresh.push(r.entry); items.push(Object.assign({}, r.entry)); });
      lists[u] = { category: p.category || "Uncategorized", items: items };
      lsSet("entries", all); lsSet("lists", lists); lookupFor(fresh); refreshApp();
      return { status: "list", name: u, count: items.length };
    }
    return null;
  }
  function importText(text) {
    return parse(text).then(function (p) { return p ? importPayload(p) : null; });
  }


  function mergeEntries(list) {
    var all = lsGet("entries") || [], added = 0, skipped = 0;
    list.forEach(function (src) {
      if (!src || !src.type || !nameOf(src)) { skipped++; return; }
      if (all.filter(function (x) { return same(x, src); })[0]) { skipped++; return; }
      var e = Object.assign({}, src, { id: uid(), checked: false, dateAdded: src.dateAdded || new Date().toISOString() });
      delete e.remindAt; delete e.reminded; delete e.moveFrom; delete e.oldDrinkType;
      all.push(e); added++;
    });
    if (added) { lsSet("entries", all); refreshApp(); }
    return { added: added, skipped: skipped };
  }
  // Built-in places: added once per key, so anything you delete later stays deleted.
  function seedOnce(key, list) {
    try { if (localStorage.getItem(key) || !Array.isArray(list)) return; } catch (e) { return; }
    var m = mergeEntries(list);
    try { localStorage.setItem(key, "1"); } catch (e) {}
    if (m.added) toast(m.added + " places added to Food & Drinks ✓");
  }


  // Places that ship with the app. First run adds them; later runs only fill in the region on the
  // ones you still have (never re-adding something you deleted, never overwriting your own edits).
  function seedAthens(list) {
    if (!Array.isArray(list)) return;
    var v1 = false, v2 = false;
    try { v1 = !!localStorage.getItem("seed.athens.v1"); v2 = !!localStorage.getItem("seed.athens.v2"); } catch (e) { return; }
    if (v2) return;
    var all = lsGet("entries") || [], patched = 0;
    if (v1) {
      list.forEach(function (src) {
        var hit = all.filter(function (x) { return same(x, src) || (src.moveFrom && x.type === src.moveFrom && nameOf(x).toLowerCase() === nameOf(src).toLowerCase()); })[0];
        if (!hit) return;
        if (!hit.region) { hit.region = src.region; patched++; }
        if (src.moveFrom && hit.type === src.moveFrom) { hit.type = src.type; hit.drinkType = src.drinkType; delete hit.cuisineType; patched++; }
        else if (src.type === "Drinks" && hit.type === "Drinks" && src.oldDrinkType && hit.drinkType === src.oldDrinkType) { hit.drinkType = src.drinkType; }
      });
      if (patched) { lsSet("entries", all); refreshApp(); }
    } else {
      var m = mergeEntries(list);
      if (m.added) toast(m.added + " places added to Food & Drinks ✓");
    }
    try { localStorage.setItem("seed.athens.v1", "1"); localStorage.setItem("seed.athens.v2", "1"); } catch (e) {}
  }

  /* ---------- add a whole file of places, keeping everything you already have ---------- */
  function openFile() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json,text/plain";
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var list;
        try { list = JSON.parse(String(r.result)); if (list && !Array.isArray(list)) list = list.entries; } catch (e) { list = null; }
        if (!Array.isArray(list)) { toast("That file isn't a list of places."); return; }
        var m = mergeEntries(list), added = m.added, skipped = m.skipped;
        toast(added + " added" + (skipped ? ", " + skipped + " already there" : "") + " ✓");
      };
      r.readAsText(f);
    };
    inp.click();
  }
  function resultMessage(r) {
    if (!r) return "That isn't a message from My Cat App.";
    if (r.status === "added") return "Added “" + r.name + "” ✓";
    if (r.status === "existed") return "You already have “" + r.name + "”";
    return "Added the list “" + r.name + "” (" + r.count + ")";
  }

  /* ---------- clipboard banner on the home screen ---------- */
  var handled = {};
  function key(t) { return String(t).slice(0, 80); }
  function checkClipboard() {
    var ban = $("shareBanner"); if (!ban) return;
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    navigator.clipboard.readText().then(function (t) {
      if (!t || handled[key(t)] || !findPayload(t)) return;
      parse(t).then(function (p) {
        if (!p) return;
        var title = p.k === "e" ? nameOf(p.entry || {}) : (p.name || "A list");
        ban.innerHTML = '<span class="sb-tx"><b></b> is on your clipboard</span><button type="button" class="sb-add">' + (p.k === "l" ? "Add list" : "Add") + '</button><button type="button" class="sb-x" aria-label="Dismiss">✕</button>';
        ban.querySelector("b").textContent = "“" + title + "”";
        ban.style.display = "flex";
        ban.querySelector(".sb-add").onclick = function () { handled[key(t)] = 1; ban.style.display = "none"; toast(resultMessage(importPayload(p))); };
        ban.querySelector(".sb-x").onclick = function () { handled[key(t)] = 1; ban.style.display = "none"; };
      });
    }).catch(function () {});
  }
  function watchClipboard() {
    // Desktop browsers ask permission on every read, so only the phone app checks on its own.
    // In a browser, use More > "Add from a friend's message" instead.
    var native = false;
    try { native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) {}
    if (!native) return;
    setTimeout(checkClipboard, 1200);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) setTimeout(checkClipboard, 300); });
    window.addEventListener("focus", function () { setTimeout(checkClipboard, 300); });
  }

  /* ---------- drawing the card ---------- */
  var W = 1080, H = 1080, FONT = "Manrope, Inter, 'Segoe UI', Roboto, system-ui, sans-serif";
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrap(g, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      var t = cur ? cur + " " + w : w;
      if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function loadBitmap(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    return new Promise(function (res, rej) { var u = URL.createObjectURL(blob), i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = u; });
  }
  // The entry's own photo first, then its poster.
  function posterFor(entry) {
    var p = Promise.resolve(null);
    try {
      var m = window.Photos && Photos.cover && Photos.cover(entry.id);
      if (m) p = Photos.fullUrl(m.id).then(function (u) { return fetch(u); }).then(function (r) { return r.blob(); });
    } catch (e) {}
    return p.catch(function () { return null; }).then(function (b) {
      if (b) return b;
      var url = window.Lookup && entry.id ? Lookup.get(entry.id) : "";
      if (url && window.PhotoUI && PhotoUI.fetchImageBlob) return PhotoUI.fetchImageBlob(url);
      return null;
    }).then(function (b) { return b ? loadBitmap(b) : null; }).catch(function () { return null; });
  }
  function base(g, label) {
    g.fillStyle = "#0F1013"; g.fillRect(0, 0, W, H);
    var gr = g.createRadialGradient(W * 0.85, -60, 10, W * 0.85, -60, 760);
    gr.addColorStop(0, "rgba(255,166,43,0.30)"); gr.addColorStop(1, "rgba(255,166,43,0)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = "#FFA62B"; g.beginPath(); g.arc(78, 80, 8, 0, 7); g.fill();
    g.font = "800 26px " + FONT; g.textBaseline = "middle"; g.fillText(label, 100, 81);
  }
  function footer(g, l1, l2) {
    g.fillStyle = "#26282e"; g.fillRect(64, 928, W - 128, 2);
    g.fillStyle = "#F4F1EA"; g.font = "800 34px " + FONT; g.textBaseline = "alphabetic"; g.fillText(l1, 64, 988);
    g.fillStyle = "#9aa0a6"; g.font = "500 26px " + FONT; g.fillText(l2, 64, 1030);
  }
  function toPng(c) { return new Promise(function (res) { c.toBlob(function (b) { res(b); }, "image/png"); }); }

  function renderEntryCard(entry) {
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d");
    return posterFor(entry).then(function (img) {
      base(g, "MY CAT APP · SUGGESTION");
      var px = 64, py = 150, pw = 420, ph = 640;
      g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 60; g.shadowOffsetY = 26; rrect(g, px, py, pw, ph, 30); g.fillStyle = "#222"; g.fill(); g.restore();
      g.save(); rrect(g, px, py, pw, ph, 30); g.clip();
      if (img) {
        var iw = img.width, ih = img.height, s = Math.max(pw / iw, ph / ih), dw = iw * s, dh = ih * s;
        g.drawImage(img, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
      } else {
        var gg = g.createLinearGradient(px, py, px + pw, py + ph); gg.addColorStop(0, "#3a2a10"); gg.addColorStop(1, "#1c1d22");
        g.fillStyle = gg; g.fillRect(px, py, pw, ph);
        g.font = "200px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText({ Cinema: "🎬", Food: "🍽️", Drinks: "🥤" }[entry.type] || "🧩", px + pw / 2, py + ph / 2);
        g.textAlign = "left";
      }
      g.restore();
      var x = 536, w = W - x - 64, tv = window.Share && Share.isTV && Share.isTV(entry);
      var kind = entry.type === "Cinema" ? (tv ? "📺  TV SERIES" : "🎬  MOVIE") : entry.type === "Food" ? "🍽️  PLACE TO EAT" : entry.type === "Drinks" ? "🥤  PLACE TO DRINK" : "🧩  IDEA";
      g.fillStyle = "#9aa0a6"; g.font = "700 28px " + FONT; g.textBaseline = "alphabetic"; g.fillText(kind, x, 190);
      var size = 84, lines;
      do { g.font = "800 " + size + "px " + FONT; lines = wrap(g, nameOf(entry), w); size -= 6; } while (lines.length > 3 && size > 40);
      size += 6; var lh = size * 1.08, y = 190 + 24 + size;
      g.fillStyle = "#F4F1EA"; lines.slice(0, 3).forEach(function (l, i) { g.fillText(l, x, y + i * lh); });
      y += Math.min(lines.length, 3) * lh - lh + 56;
      g.fillStyle = "#cfcac0"; g.font = "500 34px " + FONT;
      var meta = [entry.year, subOf(entry)].filter(Boolean).join("  ·  ");
      wrap(g, meta, w).slice(0, 3).forEach(function (l, i) { g.fillText(l, x, y + i * 46); y += 0; });
      y += Math.min(3, wrap(g, meta, w).length) * 46 + 36;
      var r = Math.max(0, Math.min(5, Math.round(Number(entry.Rating) || 0)));
      if (r) { g.font = "700 62px " + FONT; for (var s2 = 0; s2 < 5; s2++) { g.fillStyle = s2 < r ? "#FFA62B" : "#3a3c42"; g.fillText("★", x + s2 * 74, y + 40); } y += 100; }
      var who = myName();
      if (who) {
        var label = "Recommended by " + who; g.font = "500 28px " + FONT;
        var tw = g.measureText(label).width + 52; rrect(g, x, y, tw, 56, 28); g.fillStyle = "#1c1d22"; g.fill();
        g.fillStyle = "#cfcac0"; g.textBaseline = "middle"; g.fillText(label, x + 26, y + 29); g.textBaseline = "alphabetic";
      }
      footer(g, "Add it to your list", "Copy the message text, then open My Cat App");
      return toPng(c);
    });
  }
  function renderListCard(name, items) {
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d");
    base(g, "MY CAT APP · LIST");
    g.textBaseline = "alphabetic"; g.fillStyle = "#F4F1EA";
    var size = 92, lines; do { g.font = "800 " + size + "px " + FONT; lines = wrap(g, name, W - 128); size -= 6; } while (lines.length > 2 && size > 44);
    size += 6; var y = 200;
    lines.slice(0, 2).forEach(function (l) { g.fillText(l, 64, y); y += size * 1.08; });
    g.fillStyle = "#9aa0a6"; g.font = "600 32px " + FONT; g.fillText(items.length + " item" + (items.length === 1 ? "" : "s") + (myName() ? "  ·  from " + myName() : ""), 64, y + 6);
    y += 80;
    var shown = items.slice(0, 8), rowH = Math.min(76, (900 - y) / Math.max(shown.length, 1));
    shown.forEach(function (it, i) {
      var yy = y + i * rowH;
      rrect(g, 64, yy - 40, W - 128, rowH - 10, 20); g.fillStyle = "#1c1d22"; g.fill();
      g.fillStyle = "#FFA62B"; g.font = "800 30px " + FONT; g.fillText(String(i + 1), 92, yy + 4);
      g.fillStyle = "#F4F1EA"; g.font = "700 32px " + FONT;
      var t = nameOf(it), sub = [it.year, subOf(it)].filter(Boolean).join(" · ");
      while (g.measureText(t).width > 560 && t.length > 4) t = t.slice(0, -2);
      g.fillText(t === nameOf(it) ? t : t + "…", 140, yy + 4);
      g.fillStyle = "#9aa0a6"; g.font = "500 26px " + FONT; g.textAlign = "right";
      var s3 = sub; while (g.measureText(s3).width > 280 && s3.length > 3) s3 = s3.slice(0, -2);
      g.fillText(s3 === sub ? s3 : s3 + "…", W - 92, yy + 4); g.textAlign = "left";
    });
    if (items.length > shown.length) { g.fillStyle = "#9aa0a6"; g.font = "600 28px " + FONT; g.fillText("+ " + (items.length - shown.length) + " more", 64, y + shown.length * rowH + 20); }
    footer(g, "Add the whole list", "Copy the message text, then open My Cat App");
    return toPng(c);
  }

  /* ---------- sharing ---------- */
  function captionEntry(e) {
    var tv = window.Share && Share.isTV && Share.isTV(e);
    var icon = e.type === "Cinema" ? (tv ? "📺" : "🎬") : e.type === "Food" ? "🍽️" : e.type === "Drinks" ? "🥤" : "🧩";
    var r = Number(e.Rating) || 0;
    return icon + " " + nameOf(e) + [e.year, subOf(e)].filter(Boolean).map(function (x) { return " · " + x; }).join("") + (r ? " · ⭐" + r : "");
  }
  function captionList(name, items) { return "📋 " + name + " (" + items.length + ")\n" + items.slice(0, 6).map(function (i) { return "• " + nameOf(i); }).join("\n") + (items.length > 6 ? "\n…" : ""); }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.onerror = rej; r.readAsDataURL(blob);
    });
  }
  // On the phone app the web view cannot attach pictures, so use the Android share + file plugins.
  function nativeShare(blob, text, title) {
    var P = null; try { P = window.Capacitor && Capacitor.Plugins; } catch (e) {}
    if (!P || !P.Share || !P.Filesystem) return null;
    return blobToB64(blob).then(function (b64) {
      return P.Filesystem.writeFile({ path: "cat-card-" + Date.now() + ".png", data: b64, directory: "CACHE" });
    }).then(function (w) {
      return P.Share.share({ title: title, text: text, files: [w.uri], dialogTitle: "Send" });
    }).catch(function (err) {
      if (err && /cancel|dismiss/i.test(String(err.message || err))) return;
      toast("Couldn't attach the picture, sharing the text instead.");
      return Share.send(text, title);
    });
  }
  function shareOut(blob, text, title) {
    if (blob) {
      var ns = nativeShare(blob, text, title);
      if (ns) return ns;
      var file = new File([blob], "my-cat-app.png", { type: "image/png" });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ title: title, text: text, files: [file] }).catch(function (err) {
          if (err && err.name === "AbortError") return;
          Share.send(text, title);
        });
      }
    }
    toast("This phone can't send pictures from the app, so I'm sharing the text.");
    return Share.send(text, title);
  }
  function shareEntry(id, mode) {
    var e = (lsGet("entries") || []).filter(function (x) { return x.id == id; })[0];
    if (!e) { var lists = lsGet("lists") || {}; for (var n in lists) { e = ((lists[n] && lists[n].items) || []).filter(function (x) { return x.id == id; })[0]; if (e) break; } }
    if (!e) return;
    var payload = Object.assign({}, clean(e)); if (myName()) payload.from = myName();
    toast("Making the card…");
    return pack({ entry: payload }).then(function (data) {
      var text = captionEntry(e) + "\n" + PFX.e + data;
      if (mode === "text") return Share.send(text, nameOf(e));
      return renderEntryCard(e).then(function (blob) { return shareOut(blob, text, nameOf(e)); });
    });
  }
  function shareList(name, mode) {
    var lists = lsGet("lists") || {}, all = lsGet("entries") || [];
    if (!lists[name]) return;
    var items = (lists[name].items || []).map(function (it) { return all.filter(function (e) { return e.id == it.id; })[0] || it; });
    if (!items.length) { toast("Add something to the list first."); return; }
    toast("Making the card…");
    return pack({ name: name, category: lists[name].category, items: items.slice(0, 80).map(clean) }).then(function (data) {
      var text = captionList(name, items) + "\n" + PFX.l + data;
      if (mode === "text") return Share.send(text, name);
      return renderListCard(name, items).then(function (blob) { return shareOut(blob, text, name); });
    });
  }

  /* ---------- the little sheet that asks HOW to send ---------- */
  var target = null;
  function ensureSheet() {
    if ($("scSheet")) return;
    var d = document.createElement("div");
    d.innerHTML = '<div class="sc-ov" id="scOv"></div><div class="sc-sheet" id="scSheet" role="dialog" aria-label="Send">' +
      '<div class="sheet-grabber"></div><div class="sc-title" id="scTitle"></div>' +
      '<button type="button" class="sc-opt" data-m="card"><span class="sc-ic">🖼️</span><span><b>Picture card</b><i>A picture with the poster, plus text your friend can add to their app</i></span></button>' +
      '<button type="button" class="sc-opt" data-m="text"><span class="sc-ic">💬</span><span><b>Text only</b><i>A short message with the same add-to-app code</i></span></button>' +
      '<button type="button" class="sc-opt" data-m="private"><span class="sc-ic">🔒</span><span><b>Private (locked)</b><i>For paired friends only, nobody else can read it</i></span></button>' +
      '</div>';
    document.body.appendChild(d);
    $("scOv").onclick = closeSheet;
    $("scSheet").querySelectorAll(".sc-opt").forEach(function (b) {
      b.onclick = function () {
        var m = b.getAttribute("data-m"), t = target; closeSheet(); if (!t) return;
        if (m === "private") { location.href = "pchat.html#" + (t.kind === "l" ? "sendlist=" : "send=") + encodeURIComponent(t.id); return; }
        (t.kind === "l" ? shareList(t.id, m) : shareEntry(t.id, m));
      };
    });
  }
  function openSheet(kind, id, label) {
    ensureSheet(); target = { kind: kind, id: id };
    $("scTitle").textContent = "Send “" + (label || id) + "”";
    $("scOv").classList.add("show"); $("scSheet").classList.add("show");
  }
  function closeSheet() { var a = $("scOv"), b = $("scSheet"); if (a) a.classList.remove("show"); if (b) b.classList.remove("show"); }

  // "Add from a message": paste what a friend sent
  function openPaste() {
    ensureSheet();
    if (!$("scPaste")) {
      var d = document.createElement("div");
      d.innerHTML = '<div class="sc-sheet" id="scPaste" role="dialog" aria-label="Add from a message"><div class="sheet-grabber"></div><div class="sc-title">Add from a message</div>' +
        '<p class="sc-p">Copy the message your friend sent (long-press → Copy), then paste it here.</p>' +
        '<textarea id="scPasteBox" class="sc-ta" placeholder="CATENTRY1:…" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>' +
        '<div class="sc-row"><button type="button" class="sc-btn" id="scPasteBtn">Paste</button><button type="button" class="sc-btn sc-go" id="scAddBtn">Add</button></div></div>';
      document.body.appendChild(d);
      $("scPasteBtn").onclick = function () { if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { $("scPasteBox").value = t; }, function () { toast("Long-press the box and choose Paste."); }); else toast("Long-press the box and choose Paste."); };
      $("scAddBtn").onclick = function () {
        importText($("scPasteBox").value).then(function (r) { toast(resultMessage(r)); if (r) { $("scOv").classList.remove("show"); $("scPaste").classList.remove("show"); $("scPasteBox").value = ""; } });
      };
    }
    $("scPasteBox").value = ""; $("scOv").classList.add("show"); $("scPaste").classList.add("show");
    var ov = $("scOv"); var old = ov.onclick; ov.onclick = function () { closeSheet(); var p = $("scPaste"); if (p) p.classList.remove("show"); };
  }

  window.SendCard = {
    openSheet: openSheet, shareEntry: shareEntry, shareList: shareList, openPaste: openPaste, openFile: openFile, seedOnce: seedOnce, seedAthens: seedAthens, watchClipboard: watchClipboard,
    importText: importText, parse: parse, importPayload: importPayload, renderEntryCard: renderEntryCard, renderListCard: renderListCard,
    captionEntry: captionEntry, _pack: pack
  };
})();
