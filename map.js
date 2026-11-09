/* Map of your saved Food & Drinks places, with you on it.
   Self-contained slippy map (OpenStreetMap data, OpenStreetMap tiles) + one-time coordinate lookup (OpenStreetMap Nominatim). */
(function () {
  "use strict";
  var TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";   // OpenStreetMap standard tiles (no key needed)
  var VIEWBOX = "23.35,38.30,24.20,37.65";   // Attica; stops wrong-city matches
  var ATHENS = { lat: 37.9755, lng: 23.7348 };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- tiny slippy map ----------
  function Mini(el) {
    var self = this, W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 3);
    self.lat = ATHENS.lat; self.lng = ATHENS.lng; self.z = 13; self.pts = []; self.me = null; self.sel = null; self.onTap = null;
    var tiles = document.createElement("div"); tiles.className = "mp-tiles";
    var cv = document.createElement("canvas"); cv.className = "mp-cv";
    el.appendChild(tiles); el.appendChild(cv);
    var ctx = cv.getContext("2d"), cache = {};
    function wx(lng, s) { return (lng + 180) / 360 * s; }
    function wy(lat, s) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s; }
    function unx(x, s) { return x / s * 360 - 180; }
    function uny(y, s) { var n = Math.PI - 2 * Math.PI * y / s; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
    self.toPx = function (lat, lng) { var s = 256 * Math.pow(2, self.z); return [wx(lng, s) - wx(self.lng, s) + W / 2, wy(lat, s) - wy(self.lat, s) + H / 2]; };
    self.fromPx = function (px, py) { var s = 256 * Math.pow(2, self.z); return { lat: uny(wy(self.lat, s) + (py - H / 2), s), lng: unx(wx(self.lng, s) + (px - W / 2), s) }; };
    self.size = function () { W = el.clientWidth; H = el.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; self.draw(); };
    function url(x, y, z) {
      var n = Math.pow(2, z); x = ((x % n) + n) % n;
      return TILE.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    }
    self.draw = function () {
      if (!W) return;
      var tz = Math.max(2, Math.min(19, Math.round(self.z) + (dpr > 1.5 ? 1 : 0))), f = Math.pow(2, self.z - tz), s = 256 * Math.pow(2, self.z), ts = 256 * f;
      var cx = wx(self.lng, s), cy = wy(self.lat, s), x0 = Math.floor((cx - W / 2) / ts), x1 = Math.floor((cx + W / 2) / ts), y0 = Math.floor((cy - H / 2) / ts), y1 = Math.floor((cy + H / 2) / ts), keep = {};
      var max = Math.pow(2, tz);
      for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) {
        if (y < 0 || y >= max) continue;
        var k = tz + "/" + x + "/" + y; keep[k] = 1;
        var im = cache[k];
        if (!im) { im = document.createElement("img"); im.className = "mp-t"; im.draggable = false; im.alt = ""; im.src = url(x, y, tz); tiles.appendChild(im); cache[k] = im; }
        im.style.width = im.style.height = ts + 0.5 + "px";
        im.style.transform = "translate(" + Math.round(x * ts - (cx - W / 2)) + "px," + Math.round(y * ts - (cy - H / 2)) + "px)";
      }
      for (var key in cache) if (!keep[key]) { if (cache[key].parentNode) cache[key].parentNode.removeChild(cache[key]); delete cache[key]; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var i, p;
      for (i = 0; i < self.pts.length; i++) {
        var q = self.pts[i]; p = self.toPx(q.lat, q.lng);
        if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
        var r = self.z >= 15 ? 8 : self.z >= 13 ? 6 : 4.5;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 6.2832); ctx.globalAlpha = q.dim ? 0.45 : 1;
        if (q.approx) { ctx.lineWidth = 2.5; ctx.strokeStyle = q.color; ctx.stroke(); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fill(); }
        else { ctx.fillStyle = q.color; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      if (self.sel) { p = self.toPx(self.sel.lat, self.sel.lng); ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, 6.2832); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke(); }
      if (self.me) {
        p = self.toPx(self.me.lat, self.me.lng);
        ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, 6.2832); ctx.fillStyle = "rgba(66,133,244,.22)"; ctx.fill();
        ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 6.2832); ctx.fillStyle = "#4285f4"; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke();
      }
    };
    self.pan = function (dx, dy) { var s = 256 * Math.pow(2, self.z); self.lng = unx(wx(self.lng, s) - dx, s); self.lat = Math.max(-80, Math.min(80, uny(wy(self.lat, s) - dy, s))); };
    self.zoomAt = function (nz, px, py) {
      nz = Math.max(3, Math.min(18.5, nz)); if (nz === self.z) return;
      var s0 = 256 * Math.pow(2, self.z), s1 = 256 * Math.pow(2, nz);
      var ax = wx(self.lng, s0) + (px - W / 2), ay = wy(self.lat, s0) + (py - H / 2);   // world point under the finger
      var k = s1 / s0; self.z = nz;
      self.lng = unx(ax * k - (px - W / 2), s1); self.lat = uny(ay * k - (py - H / 2), s1);
    };
    self.view = function (lat, lng, z) { self.lat = lat; self.lng = lng; if (z) self.z = z; self.draw(); };
    self.fit = function (list) {
      if (!list.length) return;
      var a = 90, b = -90, c = 180, d = -180; list.forEach(function (p) { a = Math.min(a, p.lat); b = Math.max(b, p.lat); c = Math.min(c, p.lng); d = Math.max(d, p.lng); });
      var z = 17; for (; z > 3; z--) { var s = 256 * Math.pow(2, z); if (Math.abs(wx(d, s) - wx(c, s)) < W * 0.8 && Math.abs(wy(a, s) - wy(b, s)) < H * 0.8) break; }
      self.view((a + b) / 2, (c + d) / 2, z);
    };
    self.hit = function (px, py) {
      var best = null, bd = 26 * 26;
      self.pts.forEach(function (q) { var p = self.toPx(q.lat, q.lng), dx = p[0] - px, dy = p[1] - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = q; } });
      return best;
    };
    // gestures
    var ptr = {}, last = null, moved = 0, t0 = 0, raf = 0;
    function redraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; self.draw(); }); }
    function two() { var k = Object.keys(ptr); return k.length === 2 ? [ptr[k[0]], ptr[k[1]]] : null; }
    el.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".mp-ui")) return;
      try { el.setPointerCapture(e.pointerId); } catch (x) {}
      ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(ptr).length === 1) { moved = 0; t0 = Date.now(); }
      var t = two(); last = t ? { d: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) } : null;
    });
    el.addEventListener("pointermove", function (e) {
      var p = ptr[e.pointerId]; if (!p) return;
      var t = two(), r = el.getBoundingClientRect();
      if (t && last) {
        var o = [{ x: t[0].x, y: t[0].y }, { x: t[1].x, y: t[1].y }];
        p.x = e.clientX; p.y = e.clientY;
        var d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y), mx = (t[0].x + t[1].x) / 2 - r.left, my = (t[0].y + t[1].y) / 2 - r.top;
        if (last.d > 0 && d > 0) self.zoomAt(self.z + Math.log2(d / last.d), mx, my);
        self.pan(((t[0].x + t[1].x) - (o[0].x + o[1].x)) / 2, ((t[0].y + t[1].y) - (o[0].y + o[1].y)) / 2);
        last.d = d; moved = 99; redraw(); return;
      }
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) { self.pan(dx, dy); redraw(); }
    });
    function up(e) {
      var had = ptr[e.pointerId]; delete ptr[e.pointerId]; last = null;
      if (Object.keys(ptr).length === 0 && moved > 6 && self.onMove) self.onMove();
      if (had && Object.keys(ptr).length === 0 && moved <= 6 && Date.now() - t0 < 500 && self.onTap) { var r = el.getBoundingClientRect(); self.onTap(e.clientX - r.left, e.clientY - r.top); }
    }
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", function (e) { delete ptr[e.pointerId]; last = null; });
    el.addEventListener("wheel", function (e) { e.preventDefault(); var r = el.getBoundingClientRect(); self.zoomAt(self.z - e.deltaY / 300, e.clientX - r.left, e.clientY - r.top); redraw(); }, { passive: false });
    el.addEventListener("dblclick", function (e) { var r = el.getBoundingClientRect(); self.zoomAt(self.z + 1, e.clientX - r.left, e.clientY - r.top); redraw(); });
    self.zoomBy = function (d) { self.zoomAt(self.z + d, W / 2, H / 2); self.draw(); };
    window.addEventListener("resize", function () { if (W) self.size(); });
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth && (el.clientWidth !== W || el.clientHeight !== H)) self.size(); }).observe(el);
  }

  // ---------- data ----------
  var st = { radius: 1000, food: true, drinks: true, guide: false, todo: false, me: null, sel: null, geo: { on: false, token: 0, n: 0, total: 0, off: false }, map: null };
  function load() { try { return JSON.parse(localStorage.getItem("entries")) || []; } catch (e) { return []; } }
  function save(all) { try { localStorage.setItem("entries", JSON.stringify(all)); entries = all; } catch (e) {} }
  function kindOn(e) { return ((e.type === "Food" && st.food) || (e.type === "Drinks" && st.drinks)) && (st.guide || !e.athId); }
  function dist(a, b) {
    var R = 6371000, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLn = (b.lng - a.lng) * t;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLn / 2) * Math.sin(dLn / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmt(m) { return m < 950 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(m < 10000 ? 1 : 0) + " km"; }
  function points() { return savedPoints().concat(osmPoints(), extraPoints()); }
  function savedPoints() {
    return load().filter(function (e) { return kindOn(e) && typeof e.lat === "number" && typeof e.lng === "number" && (!st.todo || !e.checked); }).map(function (e) {
      var la = e.lat, ln = e.lng;
      if (e.geoApprox) { var h = 0, k = String(e.id); for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; la += ((h & 255) / 255 - 0.5) * 0.004; ln += (((h >> 8) & 255) / 255 - 0.5) * 0.005; }   // spread area-only pins a little
      return { id: e.id, lat: la, lng: ln, e: e, approx: !!e.geoApprox, color: e.type === "Drinks" ? "#3fc1d6" : "#ffa62b", dim: !!e.checked };
    });
  }

  // ---------- nearby places from OpenStreetMap (every restaurant, bar and cafe, no key) ----------
  var CELL = 0.02, OSM_TTL = 30 * 86400000, osmBusy = false, osmTried = {};
  function nm(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function cellOf(from) { return Math.round(from.lat / CELL) + "_" + Math.round(from.lng / CELL); }
  function readCells() { try { return JSON.parse(localStorage.getItem("osmCells")) || {}; } catch (e) { return {}; } }
  function writeCells(c) { try { localStorage.setItem("osmCells", JSON.stringify(c)); } catch (e) {} }
  function osmPoints() {
    var cells = readCells(), saved = load(), out = [], seen = {};
    Object.keys(cells).forEach(function (k) {
      (cells[k].p || []).forEach(function (r) {
        if (seen[r[0]]) return; seen[r[0]] = true;
        var type = r[3];
        if (!((type === "Food" && st.food) || (type === "Drinks" && st.drinks))) return;
        var e = { id: "osm:" + r[0], placeName: r[4], type: type, lat: r[1], lng: r[2], address: r[5] || "", cuisineType: r[6] || "", osm: true };
        var dup = saved.some(function (s) { return typeof s.lat === "number" && nm(s.placeName) === nm(e.placeName) && dist(s, e) < 60; });
        if (dup) return;   // already in your list: the saved entry is shown instead
        out.push({ id: e.id, lat: e.lat, lng: e.lng, e: e, approx: false, color: "#7f8aa3", dim: false, osm: true });
      });
    });
    return out;
  }
  // one request per ~2 km cell, cached for 30 days; a failed cell is retried after 10 minutes
  function loadNearby(from) {
    if (!from || typeof from.lat !== "number" || osmBusy) return;
    var key = cellOf(from), c = readCells()[key];
    if (c && Date.now() - c.t < OSM_TTL) return;
    if (osmTried[key] && Date.now() - osmTried[key] < 600000) return;
    osmTried[key] = Date.now(); osmBusy = true;
    var la = Math.round(from.lat / CELL) * CELL, ln = Math.round(from.lng / CELL) * CELL;
    var q = '[out:json][timeout:25];(node["amenity"~"^(restaurant|bar|pub|cafe|biergarten)$"]["name"](around:2500,' + la + "," + ln + "););out body;";
    getJSON("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q)).then(function (r) {
      var list = ((r && r.elements) || []).map(function (n) {
        var t = n.tags || {}, type = t.amenity === "restaurant" ? "Food" : "Drinks";
        var addr = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
        return [n.id, n.lat, n.lon, type, t.name, addr, t.cuisine || ""];
      });
      var all = readCells(); all[key] = { t: Date.now(), p: list }; writeCells(all);
      osmBusy = false; refresh(false);
    }).catch(function () { osmBusy = false; });
  }
  function saveOsm(e) {
    var all = load();
    var n = { id: crypto.randomUUID ? crypto.randomUUID() : "e" + Date.now() + Math.random().toString(16).slice(2), type: e.type, placeName: e.placeName, lat: e.lat, lng: e.lng, address: e.address || "", dateAdded: new Date().toISOString(), checked: false, note: "", source: "osm" };
    all.push(n); save(all);
    st.tonightSrc = null; st.sel = n; refresh(false);
    if (window.Share && Share.toast) Share.toast("Saved to your list"); return n;
  }

  // ---------- search a place by name: your places, nearby places, then the wider area ----------
  var sTimer = 0, sTok = 0, sItems = [];
  function extraPoints() {
    var saved = load();
    return (st.extra || []).filter(function (e) {
      if (!((e.type === "Food" && st.food) || (e.type === "Drinks" && st.drinks))) return false;
      return !saved.some(function (s) { return typeof s.lat === "number" && nm(s.placeName) === nm(e.placeName) && dist(s, e) < 60; });
    }).map(function (e) { return { id: e.id, lat: e.lat, lng: e.lng, e: e, approx: false, color: "#7f8aa3", dim: false, osm: true }; });
  }
  function openSearch() {
    $("mpSP").classList.add("show"); $("mpQ").value = "";
    $("mpSRes").innerHTML = '<p class="mp-empty">Type the name, for example one a friend told you about.</p>';
    setTimeout(function () { $("mpQ").focus(); }, 50);
  }
  function closeSearch() { var sp = $("mpSP"); if (sp) sp.classList.remove("show"); clearTimeout(sTimer); sTok++; }
  function searchLocal(k) {
    var from = st.me || (st.map && { lat: st.map.lat, lng: st.map.lng });
    var item = function (e, lat, lng) {
      return { e: e, lat: lat, lng: lng, name: e.placeName, sub: [e.type, e.cuisineType || e.drinkType, e.region].filter(Boolean).join(" · "),
               d: from ? fmt(dist(from, { lat: lat, lng: lng })) : "", dot: e.athId ? "var(--guide)" : (e.osm ? "var(--nearby)" : "var(--saved)") };
    };
    var mine = load().filter(function (e) { return (e.type === "Food" || e.type === "Drinks") && typeof e.lat === "number" && nm(e.placeName).indexOf(k) >= 0; });
    var nearby = points().filter(function (p) { return p.osm && nm(p.e.placeName).indexOf(k) >= 0; });
    return [
      { title: "In your list", items: mine.map(function (e) { return item(e, e.lat, e.lng); }) },
      { title: "Nearby places", items: nearby.map(function (p) { return item(p.e, p.lat, p.lng); }) }
    ];
  }
  function onlineItem(x, from, pts) {
    var name = x.name || String(x.display_name || "").split(",")[0], lat = parseFloat(x.lat), lng = parseFloat(x.lon);
    if (!name || isNaN(lat) || isNaN(lng)) return null;
    if (pts.some(function (p) { return nm(p.e.placeName) === nm(name) && dist(p, { lat: lat, lng: lng }) < 60; })) return null;   // already shown above
    var parts = String(x.display_name || "").split(",").map(function (s) { return s.trim(); });
    var type = /bar|pub|cafe|biergarten|nightclub/.test(x.type || "") ? "Drinks" : "Food";
    var e = { id: "ext:" + x.place_id, placeName: name, type: type, lat: lat, lng: lng, address: parts.slice(1, 3).join(", "), osm: true };
    return { e: e, lat: lat, lng: lng, name: name, sub: e.address, d: from ? fmt(dist(from, { lat: lat, lng: lng })) : "", dot: "var(--nearby)" };
  }
  function renderSearch(groups, note) {
    sItems = []; var html = "";
    groups.forEach(function (g) {
      html += '<div class="mp-sg">' + esc(g.title) + ' · ' + g.items.length + '</div>';
      if (!g.items.length) { html += '<p class="mp-empty">None.</p>'; return; }
      g.items.forEach(function (it) {
        sItems.push(it);
        html += '<div class="mp-sr"><span class="mp-dot" style="background:' + it.dot + '"></span><span class="mp-nn"><span class="mp-n">' + esc(it.name) + '</span><small class="mp-sn">' + esc([it.sub, it.d].filter(Boolean).join(" · ")) + '</small></span><button type="button" data-i="' + (sItems.length - 1) + '">Show</button></div>';
      });
    });
    if (note) html += '<p class="mp-empty">' + esc(note) + '</p>';
    var res = $("mpSRes"); res.innerHTML = html;
    res.querySelectorAll("button[data-i]").forEach(function (b) { b.onclick = function () { showSearch(sItems[+b.dataset.i]); }; });
  }
  function onSearchInput() {
    var q = $("mpQ").value.trim(), k = nm(q), tok = ++sTok;
    clearTimeout(sTimer);
    if (k.length < 2) { $("mpSRes").innerHTML = '<p class="mp-empty">Type at least two letters.</p>'; return; }
    var local = searchLocal(k);
    renderSearch(local, "Looking further in Attica…");
    sTimer = setTimeout(function () {   // one request after a short pause, bounded to Attica like the other lookups
      var u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=gr&viewbox=" + VIEWBOX + "&bounded=1&q=" + encodeURIComponent(q);
      getJSON(u).then(function (r) {
        if (tok !== sTok) return;
        var pts = points(), from = st.me || (st.map && { lat: st.map.lat, lng: st.map.lng });
        var items = (r || []).map(function (x) { return onlineItem(x, from, pts); }).filter(Boolean);
        renderSearch(local.concat([{ title: "Elsewhere in Attica", items: items }]), "");
      }).catch(function () { if (tok === sTok) renderSearch(local, "The wider search isn't available right now. Your places are above."); });
    }, 600);
  }
  function showSearch(it) {
    var e = it.e;
    if (String(e.id).indexOf("ext:") === 0) {   // a place found online: remember it on the map
      st.extra = (st.extra || []).filter(function (x) { return x.id !== e.id; }); st.extra.push(e); if (st.extra.length > 30) st.extra.shift();
    }
    if (e.type === "Food") st.food = true; if (e.type === "Drinks") st.drinks = true;
    if (e.athId) st.guide = true; st.todo = false;
    $("mpFood").classList.toggle("is-active", st.food); $("mpDrinks").classList.toggle("is-active", st.drinks);
    $("mpGuide").classList.toggle("is-active", st.guide); $("mpTodo").classList.toggle("is-active", st.todo);
    closeSearch(); refresh(false);
    var p = st.map.pts.filter(function (q) { return q.id === e.id; })[0];
    if (!p) return;
    select(p.e); viewAbove(p.lat, p.lng, Math.max(st.map.z, 16));
  }

  // ---------- coordinates (one-time lookup, cached on the entry) ----------
  function getJSON(u) {
    var cap = null; try { cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp; } catch (e) {}
    if (cap && cap.get) return cap.get({ url: u, headers: { "User-Agent": "CategoryTracker/1.0 (personal app)", "Accept-Language": "en" } }).then(function (r) {
      if (r.status === 429 || r.status === 403) { var er = new Error("busy"); er.busy = true; throw er; }
      if (r.status >= 400) throw new Error("HTTP " + r.status);
      return typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    });
    return fetch(u, { headers: { "Accept-Language": "en" } }).then(function (r) { if (r.status === 429 || r.status === 403) { var er = new Error("busy"); er.busy = true; throw er; } if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function areaOf(e) {
    var r = String(e.region || e.drinkType || "").split(/[·,\/]/)[0].trim();
    if (!r && e.address && e.address.indexOf(",") >= 0) r = e.address.slice(e.address.lastIndexOf(",") + 1).trim();
    return /^(athens|αθήνα|αθηνα)$/i.test(r) ? "" : r;
  }
  function queryFor(e) {   // first (best) query, kept for tests
    var area = areaOf(e);
    if (e.address) return e.address + (/athens|αθήνα/i.test(e.address) ? "" : ", " + (area ? area + ", " : "") + "Athens, Greece");
    return e.placeName + (area ? ", " + area : "") + ", Athens, Greece";
  }
  function search(q) {
    var u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gr&viewbox=" + VIEWBOX + "&bounded=1&q=" + encodeURIComponent(q);
    return getJSON(u).then(function (r) { return r && r[0] ? { lat: parseFloat(r[0].lat), lng: parseFloat(r[0].lon) } : null; });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function areaCache(k, v) {
    var c = {}; try { c = JSON.parse(localStorage.getItem("geoAreas") || "{}"); } catch (e) {}
    if (v === undefined) return c.hasOwnProperty(k) ? c[k] : undefined;
    c[k] = v; try { localStorage.setItem("geoAreas", JSON.stringify(c)); } catch (e) {}
  }
  // try: address → name + area → name alone → the area itself (approximate pin)
  function lookup(e) {
    var area = areaOf(e), qs = [];
    if (e.address) qs.push(queryFor(e));
    if (e.placeName) { if (area) qs.push(e.placeName + ", " + area); qs.push(e.placeName); }
    var i = 0;
    function step() {
      if (i >= qs.length) return byArea();
      var q = qs[i++];
      return search(q).then(function (r) { if (r) return r; return wait(1100).then(step); });
    }
    function byArea() {
      if (!area) return null;
      var k = area.toLowerCase(), c = areaCache(k);
      if (c !== undefined) return c ? { lat: c.lat, lng: c.lng, approx: true } : null;
      return wait(1100).then(function () { return search(area + ", Attica, Greece"); }).then(function (r) { areaCache(k, r || null); return r ? { lat: r.lat, lng: r.lng, approx: true } : null; });
    }
    return step();
  }
  var DAY = 864e5;
  function pending() {
    var now = Date.now(), list = load().filter(function (e) {
      return (e.type === "Food" || e.type === "Drinks") && typeof e.lat !== "number" && !(e.geoTry && e.geoV === 2 && now - new Date(e.geoTry).getTime() < 30 * DAY);
    });
    var rank = function (e) { return e.athId ? (e.address ? 1 : 2) : 0; };   // your own places first, then ones with an address
    list.sort(function (a, b) { return rank(a) - rank(b); });
    return list;
  }
  function geoRun() {
    var g = st.geo; if (g.off) return; var tok = ++g.token; g.on = true; g.n = 0;
    var all = load(), todo = pending().map(function (e) { return e.id; }); g.total = todo.length; status();
    if (!todo.length) { g.on = false; refresh(false); return; }
    var byId = {}; all.forEach(function (e) { byId[e.id] = e; });
    var i = 0, unsaved = 0;
    function next() {
      if (tok !== g.token) { save(all); return; }
      if (i >= todo.length) { save(all); g.on = false; refresh(false); status(); return; }
      var e = byId[todo[i++]]; if (!e) return next();
      lookup(e).then(function (r) {
        if (tok !== g.token) { if (r) { e.lat = r.lat; e.lng = r.lng; if (r.approx) e.geoApprox = true; } save(all); return; }
        if (r) { e.lat = r.lat; e.lng = r.lng; if (r.approx) e.geoApprox = true; else delete e.geoApprox; delete e.geoTry; } else { e.geoTry = new Date().toISOString(); e.geoV = 2; }
        g.n++; unsaved++;
        if (r || unsaved >= 5) { unsaved = 0; save(all); refresh(false); }   // show each new pin straight away
        status();
        setTimeout(next, 1100);
      }, function (er) {
        if (tok !== g.token) return;
        if (er && er.busy) { g.off = true; g.on = false; save(all); status("The map service asked us to slow down. It will continue next time."); return; }
        e.geoTry = new Date().toISOString(); g.n++; setTimeout(next, 1100);
      });
    }
    next();
  }
  function status(msg) {
    var el = $("mpStatus"); if (!el) return; var g = st.geo;
    var all = load().filter(function (e) { return e.type === "Food" || e.type === "Drinks"; });
    var located = all.filter(function (e) { return typeof e.lat === "number"; }).length, left = all.length - located;
    if (msg) { el.textContent = msg; return; }
    if (g.on) { el.textContent = "Finding places on the map… " + g.n + " of " + g.total + " (keep the app open)"; return; }
    el.innerHTML = esc(located.toLocaleString() + " of " + all.length.toLocaleString() + " places located") +
      (left ? ' · <button type="button" id="mpLocateAll" class="mp-retry">Locate the other ' + left.toLocaleString() + '</button>' : "");
    var b = $("mpLocateAll"); if (b) b.onclick = function () { st.geo.off = false; startGeo(); };
  }

  // ---------- screen ----------
  function ensure() {
    if ($("mpScreen")) return;
    if (!$("mpLayoutCss")) {   // layout A: full-screen map, list as a bottom sheet
      var css = document.createElement("style"); css.id = "mpLayoutCss";
      css.textContent = ".mp-top .mp-chips{flex-wrap:nowrap;gap:6px}" +
        ".mp-chips .chip{flex:1 1 0;min-width:0;height:32px;padding:0 6px;font-size:.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
        ".mp-search-btn{width:40px;height:40px;border-radius:50%;border:0;background:var(--surface);color:var(--text);display:flex;align-items:center;justify-content:center;flex:none}" +
        ".mp-sp{position:absolute;inset:0;z-index:7;background:var(--bg);padding:calc(12px + env(safe-area-inset-top,0px)) 12px 12px;display:none;flex-direction:column;gap:8px;box-sizing:border-box}" +
        ".mp-sp.show{display:flex}" +
        ".mp-sbar{display:flex;gap:8px;align-items:center}" +
        ".mp-sbar input{flex:1;min-width:0;height:42px;border-radius:21px;border:0;background:var(--surface);color:var(--text);padding:0 14px;font-size:.92rem}" +
        ".mp-sbar button{border:0;background:none;color:var(--accent);font-weight:800;padding:0 2px}" +
        "#mpSRes{overflow-y:auto;flex:1}" +
        ".mp-sg{font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:12px 4px 6px}" +
        ".mp-sr{display:flex;align-items:center;gap:10px;background:var(--surface);border-radius:14px;padding:10px 12px;margin-bottom:6px}" +
        ".mp-sr button{height:30px;padding:0 12px;border:0;border-radius:15px;background:var(--surface-2);color:var(--text);font-weight:700;font-size:.74rem;flex:none}" +
        ".mp-sn{font-size:.72rem;color:var(--muted)}" +
        ".mp-float{position:absolute;z-index:4;width:232px;background:var(--surface);border-radius:16px;padding:10px;box-shadow:0 8px 22px rgba(0,0,0,.45);display:none}" +
        ".mp-float.show{display:block}" +
        ".mp-fl-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}" +
        ".mp-fl-n{font-weight:800;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}" +
        ".mp-fl-d{font-size:.72rem;color:var(--muted);flex:none}" +
        ".mp-fl-s{font-size:.68rem;color:var(--muted);margin:1px 0 8px}" +
        ".mp-fl-b{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px}" +
        ".mp-fl-b button,.mp-fl-b a{height:32px;border:0;border-radius:16px;background:var(--surface-2);color:var(--fg);font-weight:700;font-size:.7rem;display:flex;align-items:center;justify-content:center;text-decoration:none;padding:0 4px;min-width:0}" +
        ".mp-fl-b .op-add{background:var(--accent);color:var(--accent-ink)}" +
        ".mp-top{position:absolute;top:0;left:0;right:0;z-index:4;background:linear-gradient(var(--bg) 72%,transparent);padding-bottom:16px}" +
        ".mp-map{position:absolute;inset:0;flex:none;min-height:0}" +
        ".mp-zoom{top:150px}" +
        ".mp-attr{bottom:262px}" +
        ".mp-bottom{position:absolute;left:0;right:0;bottom:0;z-index:5;max-height:none;height:250px;border-radius:22px 22px 0 0;box-shadow:0 -6px 20px rgba(0,0,0,.35);transition:height .22s ease;padding-top:0}" +
        ".mp-bottom{overflow:hidden;display:flex;flex-direction:column}" +
        ".mp-bottom.mid{height:50%}" +
        ".mp-bottom.open{height:88%}" +
        ".mp-bottom.hidden{height:0;padding:0;box-shadow:none;border-radius:0}" +
        "#mpNear{flex:1;min-height:0;display:flex;flex-direction:column}" +
        ".mp-pinned{flex:none;background:var(--surface);padding-bottom:4px}" +
        ".mp-pinned .mp-h{display:flex;justify-content:space-between;align-items:center}" +
        ".mp-steps{display:flex;gap:6px;flex:none}" +
        ".mp-chev{width:34px;height:34px;border-radius:50%;border:0;background:var(--surface-2);color:var(--text);font-weight:800;font-size:.9rem;line-height:1;flex:none;margin:0;padding:0}" +
        ".mp-chev:disabled{opacity:.35}" +
        ".mp-bottom{touch-action:none}" +
        ".mp-rows{flex:1;min-height:0;overflow-y:auto}" +
        ".mp-pill{display:none;position:absolute;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:6;height:44px;padding:0 20px;border:0;border-radius:22px;background:var(--surface);color:var(--text);font-weight:800;font-size:.84rem;box-shadow:0 6px 18px rgba(0,0,0,.45);white-space:nowrap}" +
        ".mp-bottom.hidden ~ .mp-pill{display:block}" +
        ".mp-grip{width:44px;height:5px;border-radius:3px;background:var(--muted);background-clip:content-box;opacity:.5;margin:0 auto;padding:14px 60px;box-sizing:content-box;cursor:grab;touch-action:none}";
      document.head.appendChild(css);
    }
    var d = document.createElement("div"); d.id = "mpScreen"; d.className = "mp-screen";
    d.innerHTML = '<div class="mp-top"><button type="button" class="mp-back" id="mpBack" aria-label="Back"><svg class="ic" style="width:20px;height:20px"><use href="#i-back"/></svg></button><div class="mp-title">Map</div><button type="button" class="mp-search-btn" id="mpSearchBtn" aria-label="Search a place"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>' +
      '<div class="mp-chips"><button type="button" class="chip is-active" id="mpFood">Food</button><button type="button" class="chip is-active" id="mpDrinks">Drinks</button><button type="button" class="chip" id="mpTodo">Not visited</button><button type="button" class="chip" id="mpGuide">Guide</button></div></div>' +
      '<div class="mp-map" id="mpMap"><div class="mp-ui mp-zoom"><button type="button" id="mpIn" aria-label="Zoom in">+</button><button type="button" id="mpOut" aria-label="Zoom out">−</button><button type="button" id="mpMe" aria-label="My location">◎</button></div>' +
      '<div class="mp-attr">© OpenStreetMap contributors</div><div class="mp-float" id="mpFloat"></div></div>' +
      '<div class="mp-bottom"><div class="mp-grip" id="mpGrip" role="button" aria-label="Show or hide the list"></div><div class="mp-status" id="mpStatus"></div><div id="mpLoc"></div><div id="mpCard"></div><div id="mpNear"></div></div>' + '<button type="button" class="mp-pill" id="mpPill">Near you</button><div class="mp-sp" id="mpSP"><div class="mp-sbar"><input id="mpQ" type="search" placeholder="Find a place by name" autocomplete="off"><button type="button" id="mpSCancel">Cancel</button></div><div id="mpSRes"></div></div>';
    document.body.appendChild(d);
    $("mpBack").onclick = close;
    $("mpFood").onclick = function () { st.food = !st.food; this.classList.toggle("is-active", st.food); refresh(true); };
    $("mpDrinks").onclick = function () { st.drinks = !st.drinks; this.classList.toggle("is-active", st.drinks); refresh(true); };
    $("mpGuide").onclick = function () { st.guide = !st.guide; this.classList.toggle("is-active", st.guide); refresh(false); };
    $("mpTodo").onclick = function () { st.todo = !st.todo; this.classList.toggle("is-active", st.todo); refresh(false); };
    $("mpIn").onclick = function () { st.map.zoomBy(1); }; $("mpOut").onclick = function () { st.map.zoomBy(-1); };
    $("mpMe").onclick = function () { locate(true); };
    (function () {   // drag the sheet from its header; the list moves it until full size, then scrolls
      var sheet = document.querySelector("#mpScreen .mp-bottom"), grip = $("mpGrip"), drag = null;
      var H = function () { return $("mpScreen").clientHeight; };
      var FULL = function () { return H() * 0.88; };
      var stops = function () { return [{ s: "hidden", h: 0 }, { s: "small", h: 250 }, { s: "mid", h: H() * 0.5 }, { s: "open", h: FULL() }]; };
      var rows = function () { return sheet.querySelector(".mp-rows"); };
      sheet.addEventListener("pointerdown", function (e) {
        var t = e.target.closest("button, a, input, select, textarea");
        if (t && !t.classList.contains("mp-row")) return;   // buttons work as buttons
        var r = rows();
        drag = { y: e.clientY, last: e.clientY, inRows: !!(r && r.contains(e.target)), moved: false, grip: e.target === grip };
        try { sheet.setPointerCapture(e.pointerId); } catch (x) {}
      });
      sheet.addEventListener("pointermove", function (e) {
        if (!drag) return;
        var step = e.clientY - drag.last; drag.last = e.clientY;
        var now = e.timeStamp; drag.vy = step / Math.max(1, now - (drag.t || now)); drag.t = now;   // px per ms, down is positive
        if (!drag.moved) {
          if (Math.abs(e.clientY - drag.y) <= 6) return;
          drag.moved = true; sheet.style.transition = "none";
          var fl = $("mpFloat"); if (fl) fl.classList.remove("show");
        }
        var r = rows(), full = FULL(), sh = sheet.getBoundingClientRect().height;
        if (drag.inRows && step < 0 && sh >= full - 1) { r.scrollTop += -step; return; }   // full size: the list scrolls
        if (drag.inRows && step > 0 && r.scrollTop > 0) { r.scrollTop -= step; return; }    // scrolled down: go back up first
        sheet.style.height = Math.max(0, Math.min(full, sh - step)) + "px";
      });
      var end = function (cancel) {
        if (!drag) return; var d = drag; drag = null;
        if (!d.moved) { if (d.grip && !cancel) cycleSheet(); return; }   // a tap on the handle steps through the sizes
        var h = sheet.getBoundingClientRect().height, best = null, S = stops().sort(function (a, b) { return a.h - b.h; });
        if (d.vy < -0.4) best = S.filter(function (x) { return x.h > h + 10; })[0] || S[S.length - 1];       // a quick flick goes one size up
        else if (d.vy > 0.4) best = S.filter(function (x) { return x.h < h - 10; }).pop() || S[0];          // or one size down
        else S.forEach(function (x) { if (!best || Math.abs(x.h - h) < Math.abs(best.h - h)) best = x; }); // a slow drag settles on the nearest size
        sheet.style.height = ""; sheet.style.transition = "";
        setSheet(cancel ? sheetState() : best.s);
      };
      sheet.addEventListener("pointerup", function () { end(false); });
      sheet.addEventListener("pointercancel", function () { end(true); });
    })();
    $("mpPill").onclick = function () { setSheet(LAST); };
    $("mpSearchBtn").onclick = openSearch; $("mpSCancel").onclick = closeSearch; $("mpQ").oninput = onSearchInput;
    // taps on the card must not reach the map (a tap there clears the selection and removes the buttons)
    ["pointerdown", "pointerup", "pointermove", "wheel", "dblclick"].forEach(function (t) { $("mpFloat").addEventListener(t, function (ev) { ev.stopPropagation(); }); });
    st.map = new Mini($("mpMap"));
    st.map.onMove = function () { loadNearby({ lat: st.map.lat, lng: st.map.lng }); placeFloat(); };
    st.map.onTap = function (x, y) {
      if (st.pickMe) { var ll = st.map.fromPx(x, y); st.pickMe = false; setMe(ll.lat, ll.lng, "set"); try { localStorage.setItem("mapMe", JSON.stringify({ lat: ll.lat, lng: ll.lng, t: Date.now() })); } catch (e) {} return; }
      var p = st.map.hit(x, y); select(p ? p.e : null);
    };
  }
  var SHEET = "small", LAST = "mid";
  // centres a place in the part of the map the sheet leaves open
  function viewAbove(lat, lng, z) {
    var m = st.map, el = $("mpMap"), H = el.clientHeight, W = el.clientWidth;
    var sb = document.querySelector("#mpScreen .mp-bottom"), sh = sb ? sb.offsetHeight : 0;
    m.view(lat, lng, z || m.z);
    var c = m.fromPx(W / 2, H / 2 + sh / 2); m.view(c.lat, c.lng);
  }
  function sheetState() { var b = document.querySelector("#mpScreen .mp-bottom"); return b ? (["open", "mid", "hidden"].filter(function (c) { return b.classList.contains(c); })[0] || "small") : "small"; }
  function cycleSheet() { var c = sheetState(); setSheet(c === "small" ? "mid" : c === "mid" ? "open" : "small"); }
  var SHEET_ORDER = ["hidden", "small", "mid", "open"];
  function stepSheet(dir) {
    var i = SHEET_ORDER.indexOf(sheetState()) + dir;
    if (i < 0 || i >= SHEET_ORDER.length) return;
    setSheet(SHEET_ORDER[i]);
    updateSteps();
  }
  function updateSteps() {
    var i = SHEET_ORDER.indexOf(sheetState()), up = document.querySelector("#mpScreen .mp-up"), dn = document.querySelector("#mpScreen .mp-down");
    if (up) up.disabled = i >= SHEET_ORDER.length - 1;
    if (dn) dn.disabled = i <= 0;
  }
  function setSheet(state) {
    var b = document.querySelector("#mpScreen .mp-bottom"); if (!b) return;
    SHEET = state; if (state !== "hidden") LAST = state;
    b.classList.remove("mid", "open", "hidden");
    if (state !== "small") b.classList.add(state);
    placeFloat(); updateSteps();
  }
  function startGeo() { st.geo.token++; st.geo.on = false; geoRun(); }
  function nearest(from, pts, n) { return pts.map(function (p) { return { p: p, d: dist(from, p) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, n); }
  function refresh(fit) {
    if (!st.map) return;
    var pts = points(); st.map.pts = pts;
    if (st.sel && !pts.some(function (p) { return p.id === st.sel.id; })) st.sel = null;
    st.map.sel = st.sel && pts.filter(function (p) { return p.id === st.sel.id; })[0] || null;
    if (fit && !st.fitted) { st.fitted = true; if (st.me) st.map.view(st.me.lat, st.me.lng, 15); else if (pts.length) st.map.fit(pts); }
    st.map.draw(); near(); card(); status();
    loadNearby(st.me || { lat: st.map.lat, lng: st.map.lng });
  }
  var RADII = [[500, "500 m"], [1000, "1 km"], [2000, "2 km"], [5000, "5 km"], [0, "All"]];
  function near() {
    var box = $("mpNear"); if (!box) return;
    var from = st.me || (st.map && { lat: st.map.lat, lng: st.map.lng }), pts = st.map ? st.map.pts : [];
    if (!pts.length) { box.innerHTML = '<p class="mp-empty">' + (st.geo.on ? "Finding your places on the map — this takes a few minutes the first time." : "No places on the map yet.") + '</p>'; return; }
    var r = st.radius, all = nearest(from, pts, pts.length), list = r ? all.filter(function (x) { return x.d <= r; }) : all;
    var who = st.me ? (st.meSrc === "set" ? "your set position" : "you") : "the map centre";
    box.innerHTML = '<div class="mp-h">Near ' + who + ' · ' + list.length + ' place' + (list.length === 1 ? "" : "s") + '</div>' +
      '<div class="mp-radii">' + RADII.map(function (x) { return '<button type="button" class="chip' + (x[0] === r ? " is-active" : "") + '" data-r="' + x[0] + '">' + x[1] + '</button>'; }).join("") + '</div>' +
      (list.length ? list.slice(0, 60).map(function (x) {
        var e = x.p.e, sub = [e.type === "Drinks" ? e.drinkType : e.cuisineType, e.type === "Food" ? e.region : ""].filter(Boolean).join(" · ");
        return '<button type="button" class="mp-row" data-id="' + esc(x.p.id) + '"><span class="mp-dot" style="background:' + x.p.color + '"></span><span class="mp-nn"><span class="mp-n">' + esc(e.placeName) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : "") + '</span><span class="mp-d">' + (x.p.approx ? "≈ " : "") + fmt(x.d) + '</span></button>';
      }).join("") + (list.length > 60 ? '<p class="mp-empty">Showing the nearest 60.</p>' : "")
        : '<p class="mp-empty">Nothing within ' + RADII.filter(function (x) { return x[0] === r; })[0][1] + '. Try a bigger distance.</p>');
    var hd = box.querySelector(".mp-h"), rd = box.querySelector(".mp-radii");
    if (hd && rd) {
      var pin = document.createElement("div"); pin.className = "mp-pinned";
      box.insertBefore(pin, hd); pin.appendChild(hd); pin.appendChild(rd);
      var rows = document.createElement("div"); rows.className = "mp-rows";
      while (pin.nextSibling) rows.appendChild(pin.nextSibling);
      box.appendChild(rows);
    }
    if (hd && rd) {
      var steps = document.createElement("span"); steps.className = "mp-steps";
      var up = document.createElement("button"); up.type = "button"; up.className = "mp-chev mp-up"; up.textContent = "▲";
      up.setAttribute("aria-label", "Make the list bigger"); up.onclick = function () { stepSheet(1); };
      var dn = document.createElement("button"); dn.type = "button"; dn.className = "mp-chev mp-down"; dn.textContent = "▼";
      dn.setAttribute("aria-label", "Make the list smaller"); dn.onclick = function () { stepSheet(-1); };
      steps.appendChild(up); steps.appendChild(dn);
      box.querySelector(".mp-pinned .mp-h").appendChild(steps);
      updateSteps();
    }
    box.querySelectorAll(".mp-radii .chip").forEach(function (c) { c.onclick = function () { st.radius = +c.dataset.r; near(); }; });
    box.querySelectorAll(".mp-row").forEach(function (b) { b.onclick = function () { var p = pts.filter(function (q) { return q.id === b.dataset.id; })[0]; if (p) { select(p.e); viewAbove(p.lat, p.lng, Math.max(st.map.z, 15)); } }; });
  }
  function select(e) {
    if (!st.picking) st.tonightSrc = null; st.sel = e || null;
    if (e) setSheet("small"); var p = e && st.map.pts.filter(function (q) { return q.id === e.id; })[0]; st.map.sel = p || null; st.map.draw(); card(); }
  function card() {
    var fl = $("mpFloat"), box = $("mpCard"); if (!fl || !box) return; var e = st.sel;
    if (!e) { fl.classList.remove("show"); fl.innerHTML = ""; box.innerHTML = ""; return; }
    var sub = [e.type === "Drinks" ? e.drinkType : e.cuisineType, e.type === "Food" ? e.region : ""].filter(Boolean).join(" · "), d = st.me ? (e.geoApprox ? "≈ " : "") + fmt(dist(st.me, e)) : "";
    var ts = st.tonightSrc, tag = ts ? (ts.nearby ? "Tonight · nearby" : ts.own ? "Tonight · yours" : "Tonight · guide") : "";
    var status = e.osm ? "Nearby · not in your list" : (e.checked ? "Visited" : "Not visited");
    fl.innerHTML = '<div class="mp-fl-top"><span class="mp-fl-n">' + esc(e.placeName) + '</span><span class="mp-fl-d">' + esc(d) + '</span></div>' +
      '<div class="mp-fl-s">' + esc([tag || sub, status].filter(Boolean).join(" · ")) + '</div>' +
      '<div class="mp-fl-b"><button type="button" class="op-add" id="mpOpen">' + (e.osm ? "Save" : "Open") + '</button><button type="button" id="mpList">Add to list</button>' +
      '<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + e.lat + "," + e.lng + '">Directions</a></div>';
    box.innerHTML = ts ? '<small class="mp-tn">' + esc(ts.note) + '</small><button type="button" class="op-add ghost" id="mpAnother">Another</button>' : "";
    $("mpOpen").onclick = function () { if (e.osm) { saveOsm(e); return; } close(); if (window.PhotoUI) PhotoUI.openEntry(e.id); };
    $("mpList").onclick = function () { var id = e.osm ? saveOsm(e).id : e.id; if (typeof window.openAddToListPanel === "function") window.openAddToListPanel(id); };
    var an = $("mpAnother"); if (an) an.onclick = function () { pickTonight(true); };
    placeFloat();
  }
  // the compact card sits above the tapped pin; hidden while the list sheet is open, kept above the sheet otherwise
  function placeFloat() {
    var fl = $("mpFloat"), el = $("mpMap"), sc = st.map && st.map.sel;
    if (!fl || !el || !sc || !st.sel) { if (fl) fl.classList.remove("show"); return; }
    var sb = $("mpScreen") && $("mpScreen").querySelector(".mp-bottom");
    if (!sb || sb.classList.contains("mid") || sb.classList.contains("open")) { fl.classList.remove("show"); return; }
    var W = el.clientWidth, H = el.clientHeight, p = st.map.toPx(sc.lat, sc.lng), fw = 232, fh = fl.offsetHeight || 96, floor = H - sb.offsetHeight - fh - 12;
    var left = Math.max(8, Math.min(W - fw - 8, p[0] - fw / 2));
    var top = p[1] - fh - 14; if (top < 130) top = p[1] + 16;
    top = Math.max(130, Math.min(floor, top));
    fl.style.left = left + "px"; fl.style.top = top + "px"; fl.classList.add("show");
  }
  function locNote(html) { var b = $("mpLoc"); if (!b) return; b.innerHTML = html ? '<div class="mp-loc">' + html + '</div>' : ""; var r = $("mpLocRetry"); if (r) r.onclick = function () { locate(true); }; var sm = $("mpSetMe"); if (sm) sm.onclick = pickMe; }
  function frame() {
    if (st.me) loadNearby(st.me);
    if (!st.map) return; var pts = st.map.pts;
    if (st.me && pts.length) { var n = nearest(st.me, pts, 3).map(function (x) { return x.p; }); st.map.fit(n.concat([{ lat: st.me.lat, lng: st.me.lng }])); }
    else if (st.me) st.map.view(st.me.lat, st.me.lng, 15);
  }
  function setMe(la, ln, src) {
    st.me = { lat: la, lng: ln }; st.meSrc = src || "gps"; if (src === "gps") locNote(""); else locNote('Using the position you set. <button type="button" id="mpLocRetry" class="mp-retry">Try GPS</button>');
    if (st.map) { st.map.me = st.me; frame(); }
    if (st.tonightSrc && !st.tonightSrc.fromMe) pickTonight(false);
    near(); card();
  }
  function pickMe() { st.pickMe = true; setSheet("small"); locNote("Tap the map where you are."); }
  function locate(center) {
    locNote("Finding your position…");
    var C = window.Capacitor, native = !!(C && C.isNativePlatform && C.isNativePlatform());
    var cap = null; try { cap = C && C.Plugins && C.Plugins.Geolocation; } catch (e) {}
    var hasPlugin = !!(C && C.isPluginAvailable ? C.isPluginAvailable("Geolocation") : cap);
    var done = function (p) { setMe(p.coords.latitude, p.coords.longitude, "gps"); };
    var fail = function (err) {
      var m = String((err && (err.message || err.code)) || "");
      var tip = native && !hasPlugin && /denied|permission/i.test(m) ? "Location is blocked for this app. Check the manifest lines are in, then allow Location in Android Settings › Apps › My Cat App › Permissions."
        : native && !hasPlugin ? "Couldn't get your position, and the location plugin isn't in the app."
        : /missing the following permissions|AndroidManifest/i.test(m) ? "Android doesn't know this app may use location yet: two permission lines are missing in AndroidManifest.xml (step 2 in my instructions)."
        : /denied|permission/i.test(m) ? "Location is blocked for this app. Allow it in Android Settings › Apps › My Cat App › Permissions › Location."
        : /not enabled|disabled|services|unavailable/i.test(m) ? "Location is switched off on the phone. Turn it on and try again."
        : "Couldn't get your position.";
      var saved = null; try { saved = JSON.parse(localStorage.getItem("mapMe") || "null"); } catch (e) {}
      if (saved && !st.me) { setMe(saved.lat, saved.lng, "set"); }
      locNote(esc(tip) + (m ? ' <small class="mp-why">(' + esc(m.slice(0, 120)) + ')</small>' : "") +
        '<div class="mp-locb"><button type="button" id="mpLocRetry" class="mp-retry">Try again</button><button type="button" id="mpSetMe" class="mp-retry ghost">Set my position on the map</button></div>');
      var sm = $("mpSetMe"); if (sm) sm.onclick = pickMe;
    };
    if (native && hasPlugin && cap) {
      Promise.resolve(cap.checkPermissions ? cap.checkPermissions().catch(function () { return {}; }) : {}).then(function (p) {
        if (p && p.location === "granted") return;
        return cap.requestPermissions ? cap.requestPermissions().then(function (q) { if (q && q.location === "denied") throw new Error("permission denied"); }) : 0;
      }).then(function () { return cap.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }); }).then(done, fail);
    } else if (navigator.geolocation) {
      // without the plugin the app's web view can still ask Android for location (needs the manifest lines)
      navigator.geolocation.getCurrentPosition(done, function (err) {
        if (native && !hasPlugin) fail({ message: (err && err.message ? err.message + " — " : "") + "no plugin" }); else fail(err);
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    } else fail();
  }
  // Tonight's pick: an unvisited place near you, from your own places and the guide, shown on the map
  var lastPick = null;
  function tonightPool(from) {
    var pts = points().filter(function (p) { return !p.e.checked; }), r = st.radius;
    var near = pts.filter(function (p) { return dist(from, p) <= r; }), widened = false;
    if (near.length < 5) { var wide = pts.filter(function (p) { return dist(from, p) <= 2000; }); if (wide.length > near.length) { near = wide; widened = true; } }
    return { list: near, widened: widened };
  }
  function pickTonight(again) {
    if (!st.map) return;
    var from = st.me || { lat: st.map.lat, lng: st.map.lng };
    var pool = tonightPool(from), list = pool.list;
    if (again && lastPick) { var rest = list.filter(function (p) { return p.id !== lastPick.id; }); if (rest.length) list = rest; }
    if (!list.length) { st.tonightSrc = null; st.sel = null; st.map.sel = null; st.map.draw(); locNote("Nothing unvisited nearby yet. Try a bigger distance."); card(); return; }
    var own = list.filter(function (p) { return !p.e.athId && !p.e.osm; }), guide = list.filter(function (p) { return p.e.athId; }), nearby = list.filter(function (p) { return p.e.osm; });
    var groups = [own, guide, nearby].filter(function (g) { return g.length; });
    var group = groups[Math.floor(Math.random() * groups.length)];
    var p = group[Math.floor(Math.random() * group.length)];
    var rad = st.radius ? fmt(st.radius) : "the whole map";
    var note = "Picked from " + list.length + " unvisited place" + (list.length === 1 ? "" : "s") + " within " + (pool.widened ? "2 km" : rad) + ": " + own.length + " saved by you, " + guide.length + " from the guide, " + nearby.length + " nearby. Opening hours aren't checked." + (st.me ? "" : " Using the map centre, as your position isn't known yet.");
    lastPick = p.e;
    st.picking = true; select(p.e); st.picking = false;
    st.tonightSrc = { own: !p.e.athId && !p.e.osm, nearby: !!p.e.osm, note: note, fromMe: !!st.me };
    viewAbove(p.lat, p.lng, Math.max(st.map.z, 15));
    card();
  }
  function tonight() {
    if (!window.MapView) return;
    open("");                       // Food and Drinks on
    st.guide = true; $("mpGuide").classList.add("is-active");
    lastPick = null; st.tonightSrc = null;
    pickTonight(false);
  }
  function open(kind) {
    ensure();
    st.food = kind !== "Drinks"; st.drinks = kind !== "Food"; st.guide = false; st.fitted = false; st.sel = null; st.geo.off = false;
    $("mpFood").classList.toggle("is-active", st.food); $("mpDrinks").classList.toggle("is-active", st.drinks); $("mpGuide").classList.toggle("is-active", false); locNote("");
    $("mpScreen").classList.add("show");
    setSheet("mid"); st.map.size(); refresh(true);
    locate(true);
  }
  function close() { if ($("mpScreen")) $("mpScreen").classList.remove("show"); closeSearch(); }

  window.MapView = { tonight: tonight, pickMe: pickMe, setMe: setMe, open: open, close: close, _dist: dist, _query: queryFor, _state: st, _pending: pending };
})();
