// Photo screens: entry sheet (cover + photo strip), full-screen viewer, gallery grid, share-with-photos.
// Needs photos.js and share.js to be loaded first.
(function () {
  var SPRITE =
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
    '<symbol id="pui-cam" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/></symbol>' +
    '<symbol id="pui-grid" viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></symbol>' +
    '<symbol id="pui-rows" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></symbol>' +
    '<symbol id="pui-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>' +
    '<symbol id="pui-prev" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></symbol>' +
    '<symbol id="pui-next" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></symbol>' +
    '<symbol id="pui-trash" viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></symbol>' +
    '<symbol id="pui-link" viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></symbol>' +
    '<symbol id="pui-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>' +
    '<symbol id="pui-send" viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></symbol>' +
    '<symbol id="pui-alarm" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M5 3 2 6M19 3l3 3"/></symbol>' +
    '<symbol id="pui-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4"/></symbol>' +
    '<symbol id="pui-addlist" viewBox="0 0 24 24"><path d="M4 6h11M4 12h8M4 18h8M18 13v8M14 17h8"/></symbol>' +
    '<symbol id="pui-pin" viewBox="0 0 24 24"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></symbol>' +
    '</defs></svg>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function read(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function toast(m) { if (window.Share && Share.toast) Share.toast(m); }

  var sheet, overlay, viewer, fileInput;
  var cur = null;          // { id, onEdit }
  var vState = { list: [], i: 0 };

  function ensureDom() {
    if (sheet) return;
    var holder = document.createElement("div");
    holder.innerHTML = SPRITE +
      '<div id="esOverlay" class="es-overlay"></div>' +
      '<div id="esSheet" class="es-sheet" role="dialog" aria-modal="true"></div>' +
      '<div id="pvViewer" class="pv-viewer" role="dialog" aria-modal="true">' +
      '  <div class="pv-top"><span id="pvCount" class="pv-count"></span>' +
      '    <button type="button" class="pv-btn" id="pvClose" aria-label="Close"><svg class="pui"><use href="#pui-x"/></svg></button></div>' +
      '  <div class="pv-stage"><button type="button" class="pv-nav pv-left" id="pvPrev" aria-label="Previous"><svg class="pui"><use href="#pui-prev"/></svg></button>' +
      '    <img id="pvImg" alt=""><button type="button" class="pv-nav pv-right" id="pvNext" aria-label="Next"><svg class="pui"><use href="#pui-next"/></svg></button></div>' +
      '  <div class="pv-bottom"><input id="pvCaption" class="pv-caption" type="text" maxlength="120" placeholder="Add a caption">' +
      '    <div class="pv-actions"><button type="button" class="pv-pill" id="pvCover">Make cover</button>' +
      '    <button type="button" class="pv-pill danger" id="pvDelete"><svg class="pui"><use href="#pui-trash"/></svg> Delete</button></div></div>' +
      '</div>' +
      '<input id="esFile" type="file" accept="image/*" multiple style="display:none">';
    while (holder.firstChild) document.body.appendChild(holder.firstChild);
    sheet = document.getElementById("esSheet");
    overlay = document.getElementById("esOverlay");
    viewer = document.getElementById("pvViewer");
    fileInput = document.getElementById("esFile");

    overlay.onclick = closeEntry;
    fileInput.onchange = function () {
      var files = fileInput.files, id = cur && cur.id;
      if (!files || !files.length || !id) return;
      toast("Adding photo" + (files.length > 1 ? "s" : "") + "…");
      var picked = Array.prototype.slice.call(files);
      fileInput.value = "";
      Photos.add(id, picked).then(function (n) {
        toast(n ? (n + (n === 1 ? " photo added" : " photos added")) : "Couldn't read that picture.");
      }, function (e) { toast(e && e.message ? e.message : "Couldn't add the photo."); });
    };
    document.getElementById("pvClose").onclick = closeViewer;
    document.getElementById("pvPrev").onclick = function () { stepViewer(-1); };
    document.getElementById("pvNext").onclick = function () { stepViewer(1); };
    document.getElementById("pvCover").onclick = function () {
      var m = vState.list[vState.i]; if (!m) return;
      Photos.setCover(m.id).then(function () { toast("Cover photo updated"); });
    };
    document.getElementById("pvDelete").onclick = function () {
      var m = vState.list[vState.i]; if (!m) return;
      if (!window.confirm("Delete this photo?")) return;
      Photos.remove(m.id).then(function () {
        refreshViewerList();
        if (!vState.list.length) closeViewer(); else showViewer(Math.min(vState.i, vState.list.length - 1));
      });
    };
    document.getElementById("pvCaption").onchange = function () {
      var m = vState.list[vState.i]; if (m) Photos.setCaption(m.id, this.value);
    };
    Photos.onChange(function () {
      if (cur) renderEntry();
      if (viewer.classList.contains("show")) refreshViewerList();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (viewer.classList.contains("show")) closeViewer(); else if (cur) closeEntry();
    });
  }

  // ---------- finding an entry anywhere ----------
  function findEntry(id) {
    var entries = read("entries", []), i, j;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].id == id) return { entry: entries[i], parent: null };
      var ch = entries[i].children || [];
      for (j = 0; j < ch.length; j++) if (ch[j].id == id) return { entry: ch[j], parent: entries[i] };
    }
    var lists = read("lists", {});
    for (var name in lists) {
      var items = (lists[name] && lists[name].items) || (Array.isArray(lists[name]) ? lists[name] : []);
      for (i = 0; i < items.length; i++) if (items[i].id == id) return { entry: items[i], parent: null };
    }
    return null;
  }

  function stars(r) { var n = Math.max(0, Math.min(5, Number(r) || 0)); return n ? "★".repeat(n) + "☆".repeat(5 - n) : ""; }
  function dayText(v) {
    if (!v) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
    return isNaN(d) ? "" : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  // ---------- add a photo from an image address ----------
  function sniffType(bytes) {
    var h = Array.prototype.slice.call(bytes.subarray(0, 12));
    if (h[0] === 0xFF && h[1] === 0xD8) return "image/jpeg";
    if (h[0] === 0x89 && h[1] === 0x50) return "image/png";
    if (h[0] === 0x47 && h[1] === 0x49) return "image/gif";
    if (h[0] === 0x52 && h[1] === 0x49 && h[8] === 0x57) return "image/webp";
    return "";
  }
  function fetchImageBlob(url) {
    var cap = null;
    try { cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp; } catch (e) {}
    var get = cap && cap.get
      ? cap.get({ url: url, responseType: "blob", headers: { "Accept": "image/*,*/*" } }).then(function (r) {
          if (!r || r.status >= 400) throw new Error("status " + (r && r.status));
          var d = r.data;
          if (typeof d !== "string") throw new Error("not an image");
          var bin = atob(d.replace(/^data:[^,]*,/, "")), bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new Blob([bytes], { type: sniffType(bytes) });
        })
      : fetch(url).then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.blob(); });
    return get.then(function (b) {
      if (b.type && /^image\//.test(b.type)) return b;
      return b.slice(0, 12).arrayBuffer().then(function (ab) {
        var t = sniffType(new Uint8Array(ab));
        if (!t) throw new Error("not an image");
        return b.slice(0, b.size, t);
      });
    });
  }
  function openLinkBox(id) {
    var box = document.getElementById("esLinkBox"); if (!box) return;
    box.innerHTML = '<div class="es-linkbox"><input id="esLinkIn" class="es-linkin" type="url" inputmode="url" autocomplete="off" placeholder="Paste the image address (https://…)">' +
      '<div class="es-linkrow"><button type="button" class="es-chipbtn" id="esLinkPaste">Paste</button><button type="button" class="es-chipbtn" id="esLinkGo">Add</button></div>' +
      '<div class="lk-note" id="esLinkMsg">In Chrome: long-press the picture, then “Copy image address”.</div></div>';
    var inp = document.getElementById("esLinkIn"), msg = document.getElementById("esLinkMsg"), go = document.getElementById("esLinkGo");
    function setMsg(t, bad) { msg.textContent = t; msg.style.color = bad ? "#ff8a80" : ""; }
    document.getElementById("esLinkPaste").onclick = function () {
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { inp.value = (t || "").trim(); }, function () { setMsg("Couldn't read the clipboard. Long-press the box and choose Paste.", true); });
      else setMsg("Long-press the box and choose Paste.", true);
    };
    go.onclick = function () {
      var u = (inp.value || "").trim();
      if (!/^https?:\/\//i.test(u)) { setMsg("That doesn't look like a web address. It should start with https://", true); return; }
      go.disabled = true; setMsg("Downloading…");
      fetchImageBlob(u).then(function (blob) {
        if (!cur || cur.id !== id) return;
        var ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
        return Photos.add(id, [new File([blob], "link." + ext, { type: blob.type })]).then(function (n) {
          if (n) { toast("Photo added"); } else { go.disabled = false; setMsg("Couldn't read that picture.", true); }
        });
      }).catch(function (e) {
        go.disabled = false;
        var m = String(e && e.message || "");
        setMsg(/not an image/.test(m) ? "That address is a web page, not a picture. Long-press the picture itself and copy its image address."
          : "That site won't let me save the picture. Download it to your phone and add it with Add photo instead.", true);
      });
    };
    inp.focus();
  }

  // ---------- entry sheet (C) ----------
  function renderEntry() {
    var found = findEntry(cur.id);
    if (!found) { closeEntry(); return; }
    var e = found.entry, photos = Photos.list(cur.id), t = (e.type || "Other");
    var name = Share.nameOf(e), sub = Share.subOf(e), st = stars(e.Rating);
    var tv = Share.isTV(e);
    if (tv) sub = ["TV series", sub].filter(Boolean).join(" · ");
    else if (t === "Cinema" && e.year) sub = [e.year, sub].filter(Boolean).join(" · ");
    var icon = { Food: "i-food", Drinks: "i-cup", Cinema: "i-film", Other: "i-list" }[t] || "i-list";
    var hasPhoto = photos.length > 0;
    var poster = (!hasPhoto && window.Lookup) ? Lookup.get(cur.id) : "";
    var maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(name);

    var html = '<div class="es-handle"></div>';
    html += '<div class="es-cover ph-' + t.toLowerCase() + (hasPhoto || poster ? " has-photo" : "") + (poster && !hasPhoto ? " is-poster" : "") + '" id="esCover" role="button" tabindex="0" aria-label="' + (hasPhoto ? "Open photos" : "Add a photo") + '">' +
      (hasPhoto || poster ? "" : '<svg class="ic es-cover-icon"><use href="#' + icon + '"/></svg>') +
      '<div class="es-cover-ov"></div><div class="es-cover-tx"><div class="es-title">' + esc(name) + '</div>' +
      '<div class="es-sub">' + esc([sub, st].filter(Boolean).join("  ·  ")) + '</div></div></div>';

    html += '<div class="es-strip">';
    photos.forEach(function (m, i) {
      html += '<button type="button" class="es-th" data-i="' + i + '" style="background-image:url(' + m.thumbUrl + ')" aria-label="Photo ' + (i + 1) + '">' + (i === 0 ? '<span class="es-th-tag">Cover</span>' : "") + '</button>';
    });
    html += '<button type="button" class="es-th es-add" id="esAdd"><svg class="pui"><use href="#pui-cam"/></svg><span>Add photo</span></button>' +
      '<button type="button" class="es-th es-add" id="esLink"><svg class="pui"><use href="#pui-link"/></svg><span>From link</span></button></div><div id="esLinkBox"></div>';
    if (t === "Cinema" && window.Lookup) {
      html += '<div class="es-find"><button type="button" class="es-chipbtn" id="esFind">' + (poster ? "Change poster" : "Find poster") + '</button>' +
        (poster ? '<button type="button" class="es-chipbtn" id="esFindClear" style="color:var(--muted)">Remove poster</button>' : "") + '</div><div id="esFindBox"></div>';
    }
    if (!hasPhoto) html += '<div class="es-hint">Add pictures — they show up next to it in your lists and trips.</div>';

    if (tv) {
      var tst = Share.tvStatus(e), prog = Share.tvProgress(e);
      html += '<div class="es-tv"><span class="tv-pill tv-' + tst + '">' + esc(Share.TV_STATUS[tst]) + '</span>' +
        (prog ? '<b>' + esc(prog) + '</b>' : '') +
        (typeof window.nextEpisode === "function" && tst !== "finished"
          ? '<button type="button" class="es-chipbtn" id="esNextEp">+1 episode</button><button type="button" class="es-chipbtn" id="esNextSeason">Next season</button>' : '') + '</div>';
    }
    var meta = "";
    if (e.dateVisited) meta += '<div class="es-line">📅 ' + esc(dayText(e.dateVisited)) + '</div>';
    if (e.remindAt) meta += '<div class="es-line">⏰ ' + esc(new Date(e.remindAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) + '</div>';
    if (meta) html += '<div class="es-meta">' + meta + '</div>';
    if (e.note) html += '<div class="es-note">' + esc(e.note) + '</div>';

    var canEdit = !!cur.onEdit, top = !found.parent;
    var ic = function (id, label, extra) { return '<svg class="pui"><use href="#pui-' + id + '"/></svg>'; };
    var G = "https://www.google.com/search?q=" + encodeURIComponent(name);
    html += '<div class="es-ico">' +
      '<a class="es-i" href="' + G + '" target="_blank" rel="noopener" aria-label="Search on Google" title="Google">' + ic("search") + '</a>' +
      (window.SendCard ? '<button type="button" class="es-i" id="esSend" aria-label="Send to a friend" title="Send">' + ic("send") + '</button>' : "") +
      (top && typeof window.openAlarmPicker === "function" ? '<button type="button" class="es-i" id="esAlarm" aria-label="Reminder" title="Reminder">' + ic("alarm") + '</button>' : "") +
      (top && typeof window.openAddToListPanel === "function" ? '<button type="button" class="es-i" id="esAddList" aria-label="Add to a list" title="Add to list">' + ic("addlist") + '</button>' : "") +
      (canEdit ? '<button type="button" class="es-i" id="esEdit" aria-label="Edit" title="Edit">' + ic("edit") + '</button>' : "") +
      (top && typeof window.deleteEntry === "function" ? '<button type="button" class="es-i danger" id="esDel" aria-label="Delete" title="Delete">' + ic("trash") + '</button>' : "") +
      '</div><div class="es-actions"><button type="button" class="es-btn primary" id="esClose">Done</button></div>';

    sheet.innerHTML = html;
    Photos.hydrate(sheet);
    // big cover: swap the small thumbnail for the full picture
    if (hasPhoto) {
      var coverEl = document.getElementById("esCover");
      coverEl.style.backgroundImage = "url(" + photos[0].thumbUrl + ")";
      var wanted = photos[0].id;
      Photos.fullUrl(wanted).then(function (u) {
        var c = document.getElementById("esCover");
        var now = Photos.cover(cur && cur.id);
        if (c && u && now && now.id === wanted) c.style.backgroundImage = "url(" + u + ")";
      });
    }
    if (poster) {
      var cv = document.getElementById("esCover"); cv.style.backgroundImage = "url(" + poster + ")";
      // Wikipedia posters are saved as 330px thumbnails; the big cover wants a sharper one. Try a larger size, keep the small one if it isn't available.
      if (/\/\d+px-/.test(poster)) {
        var big = poster.replace(/\/\d+px-/, "/960px-"), im = new Image();
        im.onload = function () { if (document.getElementById("esCover") === cv) cv.style.backgroundImage = "url(" + big + ")"; };
        im.src = big;
      }
    }
    var fb = document.getElementById("esFind"), fc = document.getElementById("esFindClear");
    if (fc) fc.onclick = function () { Lookup.clear(cur.id); renderEntry(); };
    if (fb) fb.onclick = function () {
      var box = document.getElementById("esFindBox"), id = cur.id, kind = tv ? "tv" : "movie";
      box.innerHTML = '<div class="lk-note">Searching…</div>';
      Lookup.search(name, kind, 6).then(function (r) {
        if (!cur || cur.id !== id) return;
        if (e.year) r = r.slice().sort(function (a, b) { return (a.year === String(e.year) ? 0 : 1) - (b.year === String(e.year) ? 0 : 1); });
        if (!r.length) { box.innerHTML = '<div class="lk-note">No match found. Try editing the name.</div>'; return; }
        box.innerHTML = '<div class="lk-list">' + r.map(function (x, i) {
          return '<button type="button" class="lk-row" data-i="' + i + '">' + (x.thumb ? '<img class="lk-img" src="' + esc(x.thumb) + '" alt="">' : '<span class="lk-img"></span>') +
            '<span class="lk-tx"><b>' + esc(x.title) + '</b><i>' + esc([x.year, x.genre].filter(Boolean).join(" · ")) + '</i></span></button>';
        }).join("") + '</div>';
        Array.prototype.forEach.call(box.querySelectorAll(".lk-row"), function (b) {
          b.onclick = function () { Lookup.set(id, r[+b.getAttribute("data-i")]); renderEntry(); };
        });
      }).catch(function () { box.innerHTML = '<div class="lk-note">Couldn\'t reach the lookup. Check your connection.</div>'; });
    };
    document.getElementById("esCover").onclick = function () { if (hasPhoto) openViewer(cur.id, 0); else fileInput.click(); };
    document.getElementById("esAdd").onclick = function () { fileInput.click(); };
    document.getElementById("esLink").onclick = function () { openLinkBox(cur.id); };
    document.getElementById("esClose").onclick = closeEntry;
    var ne = document.getElementById("esNextEp"), ns = document.getElementById("esNextSeason");
    if (ne) ne.onclick = function () { window.nextEpisode(cur.id); renderEntry(); };
    if (ns) ns.onclick = function () { window.nextSeason(cur.id); renderEntry(); };
    var wire = function (id, fn) { var b = document.getElementById(id); if (b) b.onclick = function () { var c = cur && cur.id; closeEntry(); if (c != null) fn(c); }; };
    wire("esSend", function (c) { SendCard.openSheet("e", String(c), name); });
    wire("esAlarm", function (c) { window.openAlarmPicker(c); });
    wire("esAddList", function (c) { window.openAddToListPanel(c); });
    wire("esDel", function (c) { window.deleteEntry(c); });
    var edit = document.getElementById("esEdit");
    if (edit) edit.onclick = function () { var f = cur.onEdit; closeEntry(); f(); };
    Array.prototype.forEach.call(sheet.querySelectorAll(".es-th[data-i]"), function (b) {
      b.onclick = function () { openViewer(cur.id, +b.getAttribute("data-i")); };
    });
  }

  function openEntry(id, opts) {
    ensureDom();
    opts = opts || {};
    var found = findEntry(id);
    if (!found) return;
    // a saved list opens as its checklist sheet
    if (!opts.details && found.entry.otherType === "List" && !found.parent && window.ListSheet) { window.ListSheet.open(id); return; }
    var onEdit = opts.onEdit;
    if (onEdit === undefined) {
      if (found.parent && typeof window.editChildEntry === "function") onEdit = function () { window.editChildEntry(found.parent.id, id); };
      else if (!found.parent && typeof window.editEntry === "function" && read("entries", []).some(function (x) { return x.id == id; })) onEdit = function () { window.editEntry(id); };
    }
    cur = { id: id, onEdit: onEdit || null };
    renderEntry();
    overlay.classList.add("show"); sheet.classList.add("show");
  }
  function closeEntry() {
    cur = null;
    if (!sheet) return;
    overlay.classList.remove("show"); sheet.classList.remove("show");
  }

  // ---------- full-screen viewer ----------
  function refreshViewerList() { vState.list = Photos.list(vState.entryId); }
  function showViewer(i) {
    var m = vState.list[i]; if (!m) return;
    vState.i = i;
    var img = document.getElementById("pvImg");
    img.src = m.thumbUrl;
    Photos.fullUrl(m.id).then(function (u) { if (vState.list[vState.i] && vState.list[vState.i].id === m.id) img.src = u; });
    document.getElementById("pvCount").textContent = (i + 1) + " / " + vState.list.length;
    document.getElementById("pvCaption").value = m.caption || "";
    document.getElementById("pvPrev").style.visibility = i > 0 ? "visible" : "hidden";
    document.getElementById("pvNext").style.visibility = i < vState.list.length - 1 ? "visible" : "hidden";
    document.getElementById("pvCover").style.display = i === 0 ? "none" : "";
  }
  function stepViewer(d) { var n = vState.i + d; if (n >= 0 && n < vState.list.length) showViewer(n); }
  function openViewer(entryId, i) {
    ensureDom();
    vState.entryId = entryId; refreshViewerList();
    if (!vState.list.length) return;
    viewer.classList.add("show");
    showViewer(Math.min(i || 0, vState.list.length - 1));
  }
  function closeViewer() {
    if (!viewer) return;
    viewer.classList.remove("show");
    document.getElementById("pvImg").removeAttribute("src");
  }

  // ---------- gallery grid (D) ----------
  function galleryHtml(items, emptyText) {
    if (!items || !items.length) return '<p class="text-muted">' + esc(emptyText || "Nothing here yet.") + "</p>";
    var icon = { Food: "i-food", Drinks: "i-cup", Cinema: "i-film", Other: "i-list" };
    return '<div class="gal">' + items.map(function (e) {
      var t = e.type || "Other";
      return '<div class="gal-tile pthumb ph-' + t.toLowerCase() + '" data-photo-for="' + esc(e.id) + '" role="button" tabindex="0" onclick="PhotoUI.openEntry(\'' + esc(e.id) + '\')">' +
        '<svg class="ic" aria-hidden="true"><use href="#' + (icon[t] || "i-list") + '"/></svg>' +
        '<span class="gal-cap">' + esc(Share.nameOf(e)) + '</span></div>';
    }).join("") + "</div>";
  }

  function viewToggleHtml(current, fn) {
    ensureDom();
    function b(v, label, ic) {
      return '<button type="button" class="vt-btn' + (current === v ? " is-active" : "") + '" onclick="' + fn + "('" + v + '\')"><svg class="pui"><use href="#' + ic + '"/></svg>' + label + "</button>";
    }
    return '<div class="view-toggle" role="group" aria-label="View">' + b("list", "List", "pui-rows") + b("gallery", "Gallery", "pui-grid") + "</div>";
  }

  // ---------- share (text + cover photos when the phone allows it) ----------
  function shareWithPhotos(text, title, entryIds) {
    var metas = (entryIds || []).map(function (id) { return Photos.cover(id); }).filter(Boolean).slice(0, 8);
    if (!metas.length || !navigator.share || !navigator.canShare) return Share.send(text, title);
    Promise.all(metas.map(function (m, i) {
      return Photos.fullUrl(m.id).then(function (u) { return fetch(u); }).then(function (r) { return r.blob(); })
        .then(function (b) { return new File([b], "photo-" + (i + 1) + ".jpg", { type: "image/jpeg" }); });
    })).then(function (files) {
      if (!navigator.canShare({ files: files })) return Share.send(text, title);
      return navigator.share({ title: title || "Shared from my notes", text: text, files: files }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        Share.send(text, title);
      });
    }).catch(function () { Share.send(text, title); });
  }

  window.PhotoUI = { openEntry: openEntry, closeEntry: closeEntry, openViewer: openViewer, galleryHtml: galleryHtml, viewToggleHtml: viewToggleHtml, shareWithPhotos: shareWithPhotos, fetchImageBlob: fetchImageBlob };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureDom); else ensureDom();
})();
