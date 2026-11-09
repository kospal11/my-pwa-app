// Photo storage for entries. Photos live in IndexedDB (localStorage is far too small for pictures)
// and are linked to an entry by its id, so lists and trips that copy an entry show the same photos.
(function () {
  var DB_NAME = "tracker-photos";
  var enabled = false, db = null;
  var meta = {};          // photoId -> { id, entryId, order, caption, added, thumbUrl }
  var fullUrls = {};      // photoId -> blob url (created on demand)
  var listeners = [];

  var FULL_MAX = 1280, THUMB = 360;

  function uid() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "p" + Date.now() + Math.random().toString(16).slice(2);
  }

  function req(r) {
    return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; });
  }
  function tx(stores, mode) { return db.transaction(stores, mode || "readonly"); }
  function done(t) {
    return new Promise(function (res, rej) { t.oncomplete = function () { res(); }; t.onerror = t.onabort = function () { rej(t.error); }; });
  }
  function emit() { listeners.slice().forEach(function (f) { try { f(); } catch (e) {} }); hydrate(); }

  var ready = new Promise(function (resolve) {
    try {
      var open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = function () {
        var d = open.result;
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "id" });
        if (!d.objectStoreNames.contains("full")) d.createObjectStore("full", { keyPath: "id" });
      };
      open.onerror = function () { resolve(); };
      open.onsuccess = function () {
        db = open.result; enabled = true;
        req(tx(["meta"]).objectStore("meta").getAll()).then(function (all) {
          all.forEach(function (m) {
            meta[m.id] = { id: m.id, entryId: m.entryId, order: m.order, caption: m.caption || "", added: m.added, thumbUrl: URL.createObjectURL(m.thumb) };
          });
          try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
          resolve(); hydrate();
        }, function () { resolve(); });
      };
    } catch (e) { resolve(); }
  });

  // ---- reading (synchronous, from the in-memory index) ----
  function list(entryId) {
    var out = [];
    for (var k in meta) if (meta[k].entryId == entryId) out.push(meta[k]);
    out.sort(function (a, b) { return a.order - b.order; });
    return out;
  }
  function cover(entryId) { return list(entryId)[0] || null; }
  function count(entryId) { return list(entryId).length; }

  // ---- image processing ----
  function loadImage(file) {
    function viaImg() {
      return new Promise(function (res, rej) {
        var u = URL.createObjectURL(file), i = new Image();
        i.onload = function () { res({ src: i, w: i.naturalWidth, h: i.naturalHeight, done: function () { URL.revokeObjectURL(u); } }); };
        i.onerror = function () { URL.revokeObjectURL(u); rej(new Error("Not an image")); };
        i.src = u;
      });
    }
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: "from-image" }).then(
        function (b) { return { src: b, w: b.width, h: b.height, done: function () { try { b.close(); } catch (e) {} } }; },
        viaImg);
    }
    return viaImg();
  }
  function toBlob(canvas, q) {
    return new Promise(function (res, rej) { canvas.toBlob(function (b) { b ? res(b) : rej(new Error("encode failed")); }, "image/jpeg", q); });
  }
  function process(file) {
    return loadImage(file).then(function (img) {
      var s = Math.min(1, FULL_MAX / Math.max(img.w, img.h));
      var c1 = document.createElement("canvas");
      c1.width = Math.max(1, Math.round(img.w * s)); c1.height = Math.max(1, Math.round(img.h * s));
      var g1 = c1.getContext("2d"); g1.fillStyle = "#000"; g1.fillRect(0, 0, c1.width, c1.height);
      g1.drawImage(img.src, 0, 0, c1.width, c1.height);

      var c2 = document.createElement("canvas"); c2.width = c2.height = THUMB;
      var side = Math.min(img.w, img.h);
      var g2 = c2.getContext("2d"); g2.fillStyle = "#000"; g2.fillRect(0, 0, THUMB, THUMB);
      g2.drawImage(img.src, (img.w - side) / 2, (img.h - side) / 2, side, side, 0, 0, THUMB, THUMB);
      img.done();
      return Promise.all([toBlob(c1, 0.82), toBlob(c2, 0.78)]).then(function (r) { return { full: r[0], thumb: r[1] }; });
    });
  }

  // ---- writing ----
  function putRecord(rec) {   // rec: {id, entryId, order, caption, added, thumb(Blob), full(Blob)}
    var t = tx(["meta", "full"], "readwrite");
    t.objectStore("meta").put({ id: rec.id, entryId: rec.entryId, order: rec.order, caption: rec.caption || "", added: rec.added, thumb: rec.thumb });
    t.objectStore("full").put({ id: rec.id, blob: rec.full });
    return done(t).then(function () {
      if (meta[rec.id] && meta[rec.id].thumbUrl) URL.revokeObjectURL(meta[rec.id].thumbUrl);
      meta[rec.id] = { id: rec.id, entryId: rec.entryId, order: rec.order, caption: rec.caption || "", added: rec.added, thumbUrl: URL.createObjectURL(rec.thumb) };
    });
  }

  // files: FileList or array. Resolves with the number of photos added.
  function add(entryId, files) {
    return ready.then(function () {
      if (!enabled) return Promise.reject(new Error("Photos aren't available in this browser."));
      var arr = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\//.test(f.type) || !f.type; });
      var added = 0;
      var chain = Promise.resolve();
      arr.forEach(function (f) {
        chain = chain.then(function () {
          return process(f).then(function (p) {
            var existing = list(entryId);
            var order = existing.length ? existing[existing.length - 1].order + 1 : 0;
            return putRecord({ id: uid(), entryId: entryId, order: order, caption: "", added: new Date().toISOString(), thumb: p.thumb, full: p.full }).then(function () { added++; });
          }).catch(function () { /* skip a file that can't be read */ });
        });
      });
      return chain.then(function () { emit(); return added; });
    });
  }

  function fullUrl(id) {
    if (fullUrls[id]) return Promise.resolve(fullUrls[id]);
    return ready.then(function () {
      return req(tx(["full"]).objectStore("full").get(id)).then(function (r) {
        if (!r) return meta[id] ? meta[id].thumbUrl : "";
        fullUrls[id] = URL.createObjectURL(r.blob);
        return fullUrls[id];
      });
    });
  }

  function dropMemory(id) {
    if (meta[id] && meta[id].thumbUrl) URL.revokeObjectURL(meta[id].thumbUrl);
    if (fullUrls[id]) { URL.revokeObjectURL(fullUrls[id]); delete fullUrls[id]; }
    delete meta[id];
  }
  function removeMany(ids) {
    if (!ids.length || !enabled) return Promise.resolve();
    var t = tx(["meta", "full"], "readwrite");
    ids.forEach(function (id) { t.objectStore("meta").delete(id); t.objectStore("full").delete(id); });
    return done(t).then(function () { ids.forEach(dropMemory); emit(); });
  }
  function remove(id) { return ready.then(function () { return removeMany([id]); }); }
  function removeEntry(entryId) {
    return ready.then(function () { return removeMany(list(entryId).map(function (m) { return m.id; })); });
  }

  function patch(id, fields) {
    return ready.then(function () {
      if (!enabled || !meta[id]) return;
      return req(tx(["meta"]).objectStore("meta").get(id)).then(function (rec) {
        if (!rec) return;
        for (var k in fields) rec[k] = fields[k];
        var t = tx(["meta"], "readwrite"); t.objectStore("meta").put(rec);
        return done(t).then(function () { for (var k2 in fields) meta[id][k2] = fields[k2]; emit(); });
      });
    });
  }
  function setCaption(id, caption) { return patch(id, { caption: String(caption || "").slice(0, 120) }); }
  function setCover(id) {
    var m = meta[id]; if (!m) return Promise.resolve();
    var first = cover(m.entryId);
    if (!first || first.id === id) return Promise.resolve();
    return patch(id, { order: first.order - 1 });
  }

  // ---- backup ----
  function blobToDataUrl(b) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(b); });
  }
  function dataUrlToBlob(u) { return fetch(u).then(function (r) { return r.blob(); }); }

  function exportAll() {
    return ready.then(function () {
      if (!enabled) return [];
      return req(tx(["meta"]).objectStore("meta").getAll()).then(function (metas) {
        return Promise.all(metas.map(function (m) {
          return req(tx(["full"]).objectStore("full").get(m.id)).then(function (f) {
            return Promise.all([blobToDataUrl(m.thumb), f ? blobToDataUrl(f.blob) : ""]).then(function (d) {
              return { id: m.id, entryId: m.entryId, order: m.order, caption: m.caption || "", added: m.added, thumb: d[0], full: d[1] };
            });
          });
        }));
      });
    });
  }
  function importAll(items) {
    return ready.then(function () {
      if (!enabled || !Array.isArray(items)) return 0;
      var n = 0, chain = Promise.resolve();
      items.forEach(function (it) {
        if (!it || !it.id || !it.entryId || !it.full) return;
        chain = chain.then(function () {
          return Promise.all([dataUrlToBlob(it.thumb || it.full), dataUrlToBlob(it.full)]).then(function (b) {
            return putRecord({ id: it.id, entryId: it.entryId, order: Number(it.order) || 0, caption: it.caption || "", added: it.added, thumb: b[0], full: b[1] });
          }).then(function () { n++; }).catch(function () {});
        });
      });
      return chain.then(function () { emit(); return n; });
    });
  }

  // ---- showing thumbnails ----
  // Any element with data-photo-for="<entryId>" gets the entry's cover photo as its background.
  function hydrate(root) {
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    var els = scope.querySelectorAll("[data-photo-for]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i], c = cover(el.getAttribute("data-photo-for"));
      if (c) {
        if (el.getAttribute("data-photo-id") !== c.id) {
          el.style.backgroundImage = "url(" + c.thumbUrl + ")";
          el.setAttribute("data-photo-id", c.id);
        }
        el.classList.add("has-photo"); el.classList.remove("is-poster");
      } else {
        var pu = window.Lookup ? Lookup.get(el.getAttribute("data-photo-for")) : "";
        if (pu) {   // no photo of your own: use the poster you picked
          if (el.getAttribute("data-photo-id") !== "poster:" + pu) {
            el.style.backgroundImage = "url(" + pu + ")";
            el.setAttribute("data-photo-id", "poster:" + pu);
          }
          el.classList.add("has-photo", "is-poster");
        } else if (el.classList.contains("has-photo")) {
          el.style.backgroundImage = ""; el.removeAttribute("data-photo-id"); el.classList.remove("has-photo", "is-poster");
        }
      }
      var n = el.querySelector(".pthumb-count");
      var cnt = count(el.getAttribute("data-photo-for"));
      if (cnt > 1) {
        if (!n) { n = document.createElement("span"); n.className = "pthumb-count"; el.appendChild(n); }
        n.textContent = cnt;
      } else if (n) n.remove();
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return; pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; hydrate(); });
  }
  function watch() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    hydrate();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();

  var ICON = { Food: "i-food", Drinks: "i-cup", Cinema: "i-film", Other: "i-list" };
  // Square thumbnail (shows the cover photo, or a coloured placeholder with the category icon).
  function thumbHtml(entry, extraClass, onclick) {
    var t = entry.type || "Other";
    return '<div class="pthumb ph-' + t.toLowerCase() + ' ' + (extraClass || "") + '" data-photo-for="' + String(entry.id).replace(/"/g, "") + '"' +
      (onclick ? ' onclick="' + onclick + '" role="button" tabindex="0"' : "") + '>' +
      '<svg class="ic" aria-hidden="true"><use href="#' + (ICON[t] || "i-list") + '"/></svg></div>';
  }

  window.Photos = {
    ready: ready, isEnabled: function () { return enabled; },
    list: list, cover: cover, count: count,
    add: add, fullUrl: fullUrl, remove: remove, removeEntry: removeEntry,
    setCaption: setCaption, setCover: setCover,
    exportAll: exportAll, importAll: importAll,
    hydrate: hydrate, thumbHtml: thumbHtml,
    onChange: function (f) { listeners.push(f); },
    offChange: function (f) { listeners = listeners.filter(function (x) { return x !== f; }); }
  };
})();
