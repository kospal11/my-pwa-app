// Lookup: find movies (iTunes Search) and series (TVmaze) with posters. No API keys.
// Posters/ids you pick are kept per entry id in localStorage ("posters"), so lists and copies share them.
(function () {
  var KEY = "posters";

  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---- network: use the native HTTP plugin when running inside the Android app (no CORS), else fetch ----
  var lastRaw = "";
  function peek(d) { try { return (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 110).replace(/\s+/g, " "); } catch (e) { return String(d).slice(0, 60); } }
  function http(url) {
    var cap = null;
    try { cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp; } catch (e) {}
    if (cap && cap.get) {
      return cap.get({ url: url, headers: { "Accept": "application/json, text/javascript, */*" } }).then(function (r) {
        var d = r && r.data;
        lastRaw = "app, status " + (r && r.status) + ", " + typeof d + ": " + peek(d);
        if (typeof d === "string") { d = JSON.parse(d.replace(/^[\uFEFF\s]+/, "").replace(/^[\w$.]+\(([\s\S]*)\);?\s*$/, "$1")); }
        return d;
      });
    }
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) { return JSON.parse(t); });
  }
  // iTunes sends no CORS headers, so a browser blocks fetch(). It does support JSONP (a <script> tag), which browsers allow.
  function jsonp(url) {
    return new Promise(function (res, rej) {
      var name = "__lk" + Date.now().toString(36) + Math.floor(Math.random() * 1e6), s = document.createElement("script");
      var done = false;
      function cleanup() { done = true; try { delete window[name]; } catch (e) { window[name] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
      window[name] = function (d) { if (!done) { cleanup(); res(d); } };
      s.onerror = function () { if (!done) { cleanup(); rej(new Error("blocked or offline")); } };
      s.src = url + (url.indexOf("?") < 0 ? "?" : "&") + "callback=" + name;
      setTimeout(function () { if (!done) { cleanup(); rej(new Error("timeout")); } }, 8000);
      document.head.appendChild(s);
    });
  }
  function hasNative() { try { return !!(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp); } catch (e) { return false; } }
  function httpOrJsonp(url) {
    return http(url).catch(function (e) { if (hasNative()) throw e; return jsonp(url); });
  }
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error("timeout")); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  function yearOf(s) { var m = /^(\d{4})/.exec(s || ""); return m ? m[1] : ""; }
  function cleanGenre(g) { return String(g || "").split(/\s*&\s*|\s*\/\s*/)[0].trim(); }
  function stripHtml(s) { return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim(); }

  function itunes(q, limit) {
    var url = "https://itunes.apple.com/search?media=movie&entity=movie&country=us&limit=" + (limit || 8) + "&term=" + encodeURIComponent(q);
    function map(d) {
      return ((d && d.results) || []).filter(function (r) { return r && r.trackName; }).map(function (r) {
        var art = r.artworkUrl100 || "";
        return {
          source: "itunes", kind: "movie", id: String(r.trackId || ""),
          title: r.trackName, year: yearOf(r.releaseDate), genre: cleanGenre(r.primaryGenreName),
          thumb: art, poster: art.replace(/\/\d+x\d+(bb)?\./, "/600x600bb."),
          overview: stripHtml(r.longDescription || r.shortDescription || "")
        };
      });
    }
    // first the normal way; if that errors or comes back empty, retry through the web view (JSONP)
    var firstErr = null;
    return httpOrJsonp(url).then(map, function (e) { firstErr = e; return []; }).then(function (list) {
      if (list.length) return list;
      return jsonp(url).then(function (d) { var l = map(d); if (!l.length) lastRaw += " | web view: 0 results"; return l; },
        function (e) { lastRaw += " | web view: " + (e && e.message); if (firstErr) throw firstErr; return list; });
    });
  }
  // Wikipedia: film articles come with their poster as the lead image. No key, CORS-friendly.
  function wiki(q, limit, yr) {
    var url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=0&gsrlimit=20" +
      "&gsrsearch=" + encodeURIComponent(q + (yr ? " " + yr : "") + " film") + "&prop=pageimages|description&piprop=thumbnail&pithumbsize=330&pilimit=50&pilicense=any";   // pilicense=any: film posters are non-free images
    return http(url).then(function (d) {
      var pages = d && d.query && d.query.pages ? Object.keys(d.query.pages).map(function (k) { return d.query.pages[k]; }) : [];
      pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
      var fold = function (x) { return String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
      var out = [], words = fold(q).split(/[^a-z0-9\u00c0-\uffff]+/).filter(Boolean);
      pages.forEach(function (p) {
        var desc = p.description || "";
        if (!/^(\d{4}\b.{0,90}\b(film|movie)\b|[A-Za-z\- ]{0,40}\b(film|movie)\b)/i.test(desc)) return;
        if (/television|tv series|miniseries|franchise|soundtrack|album|video game|character|film series/i.test(desc)) return;
        var ttl = fold(p.title);   // the title itself must match what was typed (drops pages that merely mention the film)
        if (!words.every(function (w) { return ttl.indexOf(w) >= 0; })) return;
        var yr = (/\b((?:18|19|20)\d\d)\b/.exec(desc) || [])[1] || "";
        var g = (/\b(?:18|19|20)\d\d\s+(?:[A-Z][a-z]+\s+)?(.*?)\s+(?:film|movie)\b/i.exec(desc) || [])[1] || "";
        g = g.replace(/\b(american|british|french|german|italian|indian|japanese|korean|canadian|australian|spanish|greek|chinese|hong kong|swedish|danish|irish)\b/ig, "").replace(/\s+/g, " ").trim();
        g = g ? g.charAt(0).toUpperCase() + g.slice(1) : "";
        var thumb = p.thumbnail && p.thumbnail.source ? p.thumbnail.source : "";
        out.push({
          source: "wikipedia", kind: "movie", id: String(p.pageid),
          title: String(p.title).replace(/\s*\([^)]*\)\s*$/, ""), year: yr, genre: cleanGenre(g),
          thumb: thumb, poster: thumb, overview: desc
        });
      });
      return out.slice(0, limit || 8);
    });
  }
  function tvmaze(q, limit) {
    return http("https://api.tvmaze.com/search/shows?q=" + encodeURIComponent(q)).then(function (d) {
      return (Array.isArray(d) ? d : []).slice(0, limit || 8).filter(function (r) { return r && r.show && r.show.name; }).map(function (r) {
        var s = r.show, img = s.image || {};
        return {
          source: "tvmaze", kind: "tv", id: String(s.id),
          title: s.name, year: yearOf(s.premiered), genre: cleanGenre((s.genres || [])[0]),
          thumb: img.medium || "", poster: img.medium || img.original || "",
          overview: stripHtml(s.summary), status: s.status || ""
        };
      });
    });
  }

  var memo = {};
  function search(q, kind, limit) {
    q = String(q || "").trim();
    if (q.length < 2) return Promise.resolve([]);
    var k = kind + "|" + q.toLowerCase();
    if (memo[k]) return Promise.resolve(memo[k]);
    var run;
    if (kind === "tv") run = withTimeout(tvmaze(q, limit), 8000);
    else run = withTimeout(itunes(q, limit), 8000).catch(function () { return []; }).then(function (r) {
      if (r.length) return r;
      return withTimeout(wiki(q, limit), 8000).then(function (w) { return w; }, function (e) { if (!r.length) { throw e; } return r; });
    });
    return run.then(function (r) { memo[k] = r; return r; });
  }

  // ---- per-entry poster store ----
  // Kept in IndexedDB (thousands of posters would crowd localStorage); a copy lives in memory so reads stay instant.
  var mem = {}, miss = {}, idb = null, listeners = [];
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  // Wikimedia thumbnail URLs repeat the file name; store them in a compact form
  var WM = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/(\w+)\/thumb\/(\w\/\w\w)\/([^\/]+)\/330px-\3$/;
  function pack(u) { var m = WM.exec(u || ""); return m ? "w|" + m[1] + "|" + m[2] + "|" + m[3] : (u || ""); }
  function unpack(p) {
    if (p && p.slice(0, 2) === "w|") { var a = p.split("|"); return "https://upload.wikimedia.org/wikipedia/" + a[1] + "/thumb/" + a[2] + "/" + a[3] + "/330px-" + a[3]; }
    return p || "";
  }

  function idbOpen() {
    return new Promise(function (res) {
      try {
        var r = indexedDB.open("tracker-posters", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("p", { keyPath: "id" }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function idbAll(db) {
    return new Promise(function (res) {
      try { var q = db.transaction("p").objectStore("p").getAll(); q.onsuccess = function () { res(q.result || []); }; q.onerror = function () { res([]); }; } catch (e) { res([]); }
    });
  }
  function persist(id, rec) {   // rec null = delete
    if (idb) {
      try { var st = idb.transaction("p", "readwrite").objectStore("p"); if (rec) st.put(Object.assign({ id: id }, rec)); else st.delete(id); } catch (e) {}
    } else { jset(KEY, mem); }
  }
  var ready = idbOpen().then(function (db) {
    idb = db;
    var legacy = jget(KEY, null);   // posters saved by the first version, in localStorage
    var load = db ? idbAll(db) : Promise.resolve([]);
    return load.then(function (rows) {
      rows.forEach(function (r) { if (r.m) miss[r.id] = r.m; else mem[r.id] = { p: r.p, t: r.t, y: r.y, s: r.s }; });
      if (legacy && typeof legacy === "object") {
        Object.keys(legacy).forEach(function (id) { if (!mem[id] && legacy[id] && legacy[id].p) { mem[id] = { p: pack(legacy[id].p), t: legacy[id].t || 0, y: legacy[id].y || "", s: legacy[id].s }; if (db) persist(id, mem[id]); } });
        if (db) { try { localStorage.removeItem(KEY); } catch (e) {} }
      }
      emit();
    });
  });

  function get(id) { var m = mem[id]; return m && m.p ? unpack(m.p) : ""; }
  function meta(id) { return mem[id] || null; }
  function set(id, pick, quiet) {
    if (!id || !pick) return;
    mem[id] = { p: pack(pick.poster || ""), t: pick.kind === "tv" ? Number(pick.id) || 0 : 0, y: pick.year || "", s: pick.source };
    delete miss[id];
    persist(id, mem[id]);
    if (!quiet) emit();
  }
  function clear(id) { if (mem[id]) { delete mem[id]; persist(id, null); emit(); } }
  function exportPosters() { var o = {}; Object.keys(mem).forEach(function (id) { o[id] = mem[id]; }); return o; }
  function importPosters(obj) {
    if (!obj || typeof obj !== "object") return 0;
    var n = 0;
    Object.keys(obj).forEach(function (id) {
      var v = obj[id];
      if (v && v.p && !mem[id]) { mem[id] = { p: pack(unpack(v.p)), t: v.t || 0, y: v.y || "", s: v.s }; persist(id, mem[id]); n++; }
    });
    if (n) emit();
    return n;
  }

  // ---- one-off bulk run: find a poster for every movie / series that has none ----
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
      .replace(/\(\s*(?:18|19|20)\d\d\s*\)\s*$/, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^(the|a|an) /, "").trim();
  }
  function splitYear(name) {
    var m = /\(\s*((?:18|19|20)\d\d)\s*\)\s*$/.exec(name || "");
    return { name: String(name || "").replace(/\s*\(\s*(?:18|19|20)\d\d\s*\)\s*$/, "").trim() || String(name || ""), year: m ? m[1] : "" };
  }
  function bulkCandidates(entries, includeMissed) {
    var seen = {}, out = [], photos = window.Photos && Photos.count ? Photos.count : function () { return 0; };
    (entries || []).forEach(function (e) {
      if (!e || e.type !== "Cinema" || !e.id || seen[e.id]) return; seen[e.id] = 1;
      var name = e.movieName || ""; if (!name) return;
      if (mem[e.id] && mem[e.id].p) return;
      if (photos(e.id) > 0) return;
      if (!includeMissed && miss[e.id]) return;
      out.push({ id: e.id, name: name, kind: e.kind === "tv" ? "tv" : "movie", year: e.year ? String(e.year) : "" });
    });
    return out;
  }
  function bulkCounts(entries) {
    var total = 0, withPoster = 0, missed = 0, seen = {};
    (entries || []).forEach(function (e) {
      if (!e || e.type !== "Cinema" || !e.id || seen[e.id]) return; seen[e.id] = 1; total++;
      if (mem[e.id] && mem[e.id].p) withPoster++; else if (miss[e.id]) missed++;
    });
    return { total: total, withPoster: withPoster, missed: missed, todo: bulkCandidates(entries, false).length };
  }
  function pickExact(name, list, hint) {
    var n = norm(name), yr = hint || (/\(\s*((?:18|19|20)\d\d)\s*\)\s*$/.exec(name) || [])[1];
    var hits = list.filter(function (x) { return x.poster && norm(x.title) === n; });
    if (!hits.length) return null;
    if (yr) {   // a known year must match (±1 for release-date differences); otherwise better no poster than the wrong film
      var near = hits.filter(function (x) { return x.year && Math.abs(Number(x.year) - Number(yr)) <= 1; });
      near.sort(function (a, b) { return (a.year === yr ? 0 : 1) - (b.year === yr ? 0 : 1); });
      return near[0] || null;
    }
    return hits[0];
  }
  // ---- release years from the bundled movie list (years.js) ----
  function yearFor(e) {
    var tbl = window.MOVIE_YEARS; if (!tbl || !e) return "";
    var name = e.movieName || "", m = /\(\s*((?:18|19|20)\d\d)\s*\)\s*$/.exec(name);
    if (m) return m[1];
    var c = tbl[norm(name)]; if (!c || !c.length) return "";
    if (c.length === 1) return c[0][0];
    var mine = String(e.genre || e.cinemaName || "").toLowerCase().split(/\s*,\s*/).filter(Boolean), best = c[0], bs = -1;
    c.forEach(function (x) {
      var theirs = x[1].toLowerCase().split(","), hit = 0;
      mine.forEach(function (g) { if (theirs.indexOf(g) >= 0) hit++; });
      var score = hit * 10 - Math.abs(theirs.length - mine.length);
      if (score > bs) { bs = score; best = x; }
    });
    return best[0];
  }
  // Fill in the year on every movie that has none (entries, trips' children and list copies). Returns counts.
  function applyYears(clearWrong) {
    var out = { total: 0, set: 0, already: 0, unknown: 0, cleared: 0 };
    function fix(e) {
      if (!e || e.type !== "Cinema" || e.kind === "tv") return false;
      var changed = false;
      if (!e.year) { var y = yearFor(e); if (y) { e.year = y; changed = true; out.set++; } else out.unknown++; } else out.already++;
      if (clearWrong && e.year) {
        var mm = meta(e.id);
        if (mm && mm.y && mm.s !== "itunes" && Math.abs(Number(mm.y) - Number(e.year)) > 1) { clear(e.id); out.cleared++; }
      }
      return changed;
    }
    var dirty = false, list = [];
    try { list = JSON.parse(localStorage.getItem("entries")) || []; } catch (x) {}
    list.forEach(function (e) { out.total++; if (fix(e)) dirty = true; (e.children || []).forEach(function (c) { if (fix(c)) dirty = true; }); });
    if (dirty) { try { localStorage.setItem("entries", JSON.stringify(list)); } catch (x) {} }
    // lists keep their own copies of entries (same ids): give them the year too
    var byId = {}; list.forEach(function (e) { if (e.year) byId[e.id] = e.year; });
    try {
      var lists = JSON.parse(localStorage.getItem("lists") || "{}"), ld = false;
      Object.keys(lists).forEach(function (k) {
        var items = lists[k] && lists[k].items ? lists[k].items : (Array.isArray(lists[k]) ? lists[k] : []);
        items.forEach(function (e) { if (e && e.type === "Cinema" && !e.year && byId[e.id]) { e.year = byId[e.id]; ld = true; } });
      });
      if (ld) localStorage.setItem("lists", JSON.stringify(lists));
    } catch (x) {}
    return out;
  }
  // opts: { includeMissed, delay (ms, default 250), concurrency (default 2), onProgress(p) }
  function bulkRun(entries, opts) {
    opts = opts || {};
    var queue = bulkCandidates(entries, !!opts.includeMissed), total = queue.length, i = 0, done = 0, found = 0, nomatch = 0, errRun = 0;
    var delay = opts.delay == null ? 250 : opts.delay, stopped = false, reason = "finished";
    function report(cur) { if (opts.onProgress) { try { opts.onProgress({ done: done, total: total, found: found, nomatch: nomatch, current: cur || "" }); } catch (e) {} } }
    function one(c) {
      var p = c.kind === "tv" ? tvmaze(splitYear(c.name).name, 6) : wiki(splitYear(c.name).name, 12, c.year || splitYear(c.name).year);
      return withTimeout(p, 12000).then(function (list) {
        errRun = 0;
        var hit = pickExact(c.name, list, c.year);
        if (hit) { set(c.id, hit, true); found++; }
        else { miss[c.id] = Date.now(); persist(c.id, { m: miss[c.id] }); nomatch++; }
      }, function () {
        errRun++;
        if (errRun >= 6) { stopped = true; reason = "connection"; }
      }).then(function () { done++; });
    }
    function worker() {
      function next() {
        if (stopped || i >= queue.length) return Promise.resolve();
        var c = queue[i++]; report(c.name);
        return one(c).then(function () { if (done % 40 === 0) emit(); return new Promise(function (r) { setTimeout(r, delay); }); }).then(next);
      }
      return next();
    }
    var workers = [], n = Math.max(1, opts.concurrency || 2);
    for (var k = 0; k < n; k++) workers.push(worker());
    var promise = ready.then(function () { return Promise.all(workers); }).then(function () { emit(); report(""); return { done: done, total: total, found: found, nomatch: nomatch, reason: stopped && reason === "connection" ? "connection" : (i >= queue.length ? "finished" : "paused") }; });
    return { promise: promise, stop: function () { stopped = true; if (reason === "finished") reason = "paused"; } };
  }

  // Poster for a bare title (the "Tonight's pick" banner), remembered by name
  function posterByName(title, kind, strict) {
    var cache = jget("posterByName", {}), k = (strict ? "s|" : "") + (kind || "movie") + "|" + String(title || "").toLowerCase();
    if (cache[k] !== undefined) return Promise.resolve(cache[k]);
    return search(title, kind || "movie", 3).then(function (r) {
      var best = r.filter(function (x) { return x.title.toLowerCase() === String(title).toLowerCase(); })[0] || (strict ? null : r[0]);
      var url = best ? best.poster : "";
      cache[k] = url; jset("posterByName", cache);
      return url;
    }).catch(function () { return ""; });
  }

  // Next episode of a followed series (cached for 12h)
  function nextEpisode(tvId) {
    var cache = jget("nextEp", {}), c = cache[tvId], now = Date.now();
    if (c && now - c.at < 12 * 3600 * 1000) return Promise.resolve(c.v);
    return withTimeout(http("https://api.tvmaze.com/shows/" + tvId + "?embed=nextepisode"), 8000).then(function (d) {
      var ne = d && d._embedded && d._embedded.nextepisode;
      var v = ne ? { date: ne.airdate, season: ne.season, number: ne.number } : null;
      cache[tvId] = { at: now, v: v }; jset("nextEp", cache);
      return v;
    }).catch(function () { return c ? c.v : null; });
  }

  // Plain-language self test, shown from More → "Test movie lookup"
  function diagnose() {
    var out = [], native = false;
    try { native = !!(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp); } catch (e) {}
    out.push("Running in the Android app: " + (window.Capacitor ? "yes" : "no (browser)"));
    out.push("Native network plugin: " + (native ? "yes" : "no"));
    function t(label, p) {
      return withTimeout(p, 8000).then(function (r) { out.push(label + ": OK (" + r.length + " results" + (r[0] ? ", first: " + r[0].title : "") + ")"); },
        function (e) { out.push(label + ": FAILED (" + (e && e.message ? e.message : e) + ")"); });
    }
    return t("Movies (iTunes)", itunes("inception", 3)).then(function () { return t("Movies (Wikipedia)", wiki("inception", 3)); }).then(function () { if (lastRaw) out.push("iTunes reply: " + lastRaw); return t("Series (TVmaze)", tvmaze("breaking bad", 3)); }).then(function () {
      if (!window.Capacitor) out.push("Note: this ran in a web browser, not the installed app. Run the test again inside the app on your phone.");
      else if (/FAILED/.test(out.join("|")))
        out.push("Hint: the app's web view blocked the request. Add  \"plugins\": { \"CapacitorHttp\": { \"enabled\": true } }  to capacitor.config.json, run npx cap sync android and rebuild.");
      return out;
    });
  }

  // Newly added film articles of a year (Wikipedia category, newest additions first). No key.
  function newFilms(year, force) {
    year = year || new Date().getFullYear();
    var key = "newFilms" + year, cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    if (!force && cached && Date.now() - cached.t < 6 * 3600 * 1000 && cached.list && cached.list.length) return Promise.resolve(cached.list);
    var url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=categorymembers&gcmnamespace=0&gcmtype=page" +
      "&gcmtitle=" + encodeURIComponent("Category:" + year + " films") + "&gcmsort=timestamp&gcmdir=desc&gcmlimit=50" +
      "&prop=pageimages|description&piprop=thumbnail&pithumbsize=330&pilimit=50&pilicense=any";
    return http(url).then(function (d) {
      var pages = d && d.query && d.query.pages ? Object.keys(d.query.pages).map(function (k) { return d.query.pages[k]; }) : [];
      pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
      var out = [];
      pages.forEach(function (p) {
        var desc = p.description || "", thumb = p.thumbnail && p.thumbnail.source;
        if (!thumb) return;
        if (!/\b(film|movie)\b/i.test(desc) || /television|tv series|miniseries|franchise|soundtrack|album|video game|film series|list of/i.test(desc)) return;
        var yr = (/\b((?:18|19|20)\d\d)\b/.exec(desc) || [])[1] || String(year);
        if (Math.abs(Number(yr) - year) > 1) return;
        var g = (/\b(?:18|19|20)\d\d\s+(?:[A-Z][a-z]+\s+)?(.*?)\s+(?:film|movie)\b/i.exec(desc) || [])[1] || "";
        g = g.replace(/\b(american|british|french|german|italian|indian|japanese|korean|canadian|australian|spanish|greek|chinese|hong kong|swedish|danish|irish|mexican|brazilian)\b/ig, "").replace(/\s+/g, " ").trim();
        out.push({ id: String(p.pageid), title: String(p.title).replace(/\s*\([^)]*\)\s*$/, ""), year: yr, genre: cleanGenre(g ? g.charAt(0).toUpperCase() + g.slice(1) : ""), poster: thumb, overview: desc });
      });
      if (out.length) { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), list: out })); } catch (e) {} }
      return out;
    }, function (e) { if (cached && cached.list) return cached.list; throw e; });
  }


  // ---- new TV series: Wikipedia debut categories + the premiere date found in each intro ----
  var MONTH_FULL = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  function premiereDate(t) {
    t = String(t || "");
    var re1 = /(?:premier|debut|releas|air|broadcast)\w*[^.]{0,100}?\b(?:on|from|in)\s+(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)/i;
    var re2 = /(?:premier|debut|releas|air|broadcast)\w*[^.]{0,100}?\b(?:on|from|in)\s+(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]{2,8}),?\s+(20\d\d)/i;
    var m = re1.exec(t), mo, d, y;
    if (m) { mo = m[1]; d = m[2]; y = m[3]; } else if ((m = re2.exec(t))) { d = m[1]; mo = m[2]; y = m[3]; } else return 0;
    var mi = MONTH_FULL.indexOf(String(mo).toLowerCase()); if (mi < 0) mi = MONTH_FULL.map(function (x) { return x.slice(0, 3); }).indexOf(String(mo).toLowerCase().slice(0, 3));
    return mi < 0 ? 0 : Date.UTC(Number(y), mi, Number(d));
  }
  function newSeries(year, force) {
    year = year || new Date().getFullYear();
    var key = "newSeries" + year, cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    if (!force && cached && Date.now() - cached.t < 6 * 3600 * 1000 && cached.list && cached.list.length) return Promise.resolve(cached.list);
    function cat(y) {
      var url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=categorymembers&gcmnamespace=0&gcmtype=page" +
        "&gcmtitle=" + encodeURIComponent("Category:" + y + " American television series debuts") + "&gcmsort=timestamp&gcmdir=desc&gcmlimit=50" +
        "&prop=pageimages|description&piprop=thumbnail&pithumbsize=330&pilimit=50&pilicense=any";
      return withTimeout(http(url), 15000).then(function (d) {
        var pages = d && d.query && d.query.pages ? Object.keys(d.query.pages).map(function (k) { return d.query.pages[k]; }) : [];
        pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
        return pages;
      }).catch(function () { return []; });
    }
    return Promise.all([cat(year), cat(year + 1)]).then(function (r) {
      var pages = r[0].concat(r[1]), seen = {}, items = [];
      pages.forEach(function (p) {
        var desc = p.description || "", thumb = p.thumbnail && p.thumbnail.source;
        if (!thumb || seen[p.pageid]) return; seen[p.pageid] = 1;
        if (!/television|tv series|web series|miniseries|streaming series|animated series|sitcom/i.test(desc) || /\bfilm\b|season|list of|episode|soundtrack|album/i.test(desc)) return;
        items.push({ id: String(p.pageid), title: String(p.title).replace(/\s*\([^)]*\)\s*$/, ""), year: String(year), genre: "", poster: thumb, overview: desc, when: 0, kind: "tv" });
      });
      if (!items.length) { if (cached && cached.list) return cached.list; return []; }
      var jobs = [];
      for (var i = 0; i < items.length; i += 20) (function (chunk) {
        var url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&exlimit=20&exchars=700&pageids=" + chunk.map(function (c) { return c.id; }).join("|");
        jobs.push(withTimeout(http(url), 15000).then(function (d) {
          var pg = d && d.query && d.query.pages || {};
          chunk.forEach(function (c) { var x = pg[c.id] && pg[c.id].extract || ""; c.when = premiereDate(x); c.genre = cleanGenre(genreFromText(c.overview + " " + x.slice(0, 160))); });
        }).catch(function () {}));
      })(items.slice(i, i + 20));
      return Promise.all(jobs).then(function () {
        items.forEach(function (c) { if (!c.genre) c.genre = cleanGenre(genreFromText(c.overview)); });
        try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), list: items })); } catch (e) {}
        return items;
      });
    }, function (e) { if (cached && cached.list) return cached.list; throw e; });
  }

  // ---- genres from a sentence like "is a 2026 American science fiction thriller film" ----
  var GENRE_WORDS = [
    [/science[- ]fiction|sci-fi/, "Science Fiction"], [/romantic comedy|rom-com/, "Romance, Comedy"], [/romantic|romance/, "Romance"],
    [/animated|animation/, "Animation"], [/action/, "Action"], [/adventure/, "Adventure"], [/comedy/, "Comedy"], [/crime/, "Crime"],
    [/documentary/, "Documentary"], [/drama/, "Drama"], [/family/, "Family"], [/fantasy/, "Fantasy"], [/horror|slasher/, "Horror"],
    [/musical/, "Music"], [/mystery/, "Mystery"], [/thriller/, "Thriller"], [/\bwar\b/, "War"], [/western/, "Western"],
    [/biographical|biopic/, "Biography"], [/superhero/, "Action"], [/sports?\b/, "Sport"], [/historical/, "History"], [/heist/, "Crime"]
  ];
  function genreFromText(t) {
    t = String(t || "").toLowerCase();
    var cut = t.search(/\b(film|movie)\b/);                 // only the words before "film"
    if (cut > 0) t = t.slice(0, cut);
    var found = [];
    GENRE_WORDS.map(function (g) { var m = g[0].exec(t); return m ? { i: m.index, v: g[1] } : null; }).filter(Boolean)
      .sort(function (a, b) { return a.i - b.i; })
      .forEach(function (x) { x.v.split(", ").forEach(function (v) { if (found.indexOf(v) < 0) found.push(v); }); });
    return found.slice(0, 3).join(", ");
  }
  // Genre for a Wikipedia pick whose short description had none: read the article's first sentence
  function genreFor(pick) {
    if (!pick) return Promise.resolve("");
    if (pick.source && pick.source !== "wikipedia") return Promise.resolve(pick.genre || "");   // iTunes / TVmaze already give one
    var local = genreFromText(pick.overview);
    if (local) return Promise.resolve(local);
    if (!pick.id) return Promise.resolve(pick.genre || "");
    var url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&exchars=500&pageids=" + encodeURIComponent(pick.id);
    return withTimeout(http(url), 8000).then(function (d) {
      var p = d && d.query && d.query.pages && d.query.pages[pick.id];
      var ex = (p && p.extract) || "";
      var m = /\b(?:is|was)\s+an?\s+([^.]*?\b(?:film|movie)\b)/i.exec(ex);
      return genreFromText(m ? m[1] : ex.slice(0, 300)) || pick.genre || "";
    }).catch(function () { return pick.genre || ""; });
  }

  // ---- "In theaters" + "Coming soon": Wikipedia's list of American films of the year (release dates) ----
  var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  function parseReleaseTables(html, year) {
    var doc = new DOMParser().parseFromString(html, "text/html"), out = [], seen = {};
    Array.prototype.forEach.call(doc.querySelectorAll("table.wikitable"), function (tb) {
      var carry = [];                                           // rowspan cells still running down from earlier rows
      Array.prototype.forEach.call(tb.querySelectorAll("tr"), function (tr) {
        var row = [], own = Array.prototype.filter.call(tr.children, function (c) { return /^T[DH]$/.test(c.tagName); }), col = 0;
        function takeCarry() { while (carry[col] && carry[col].left > 0) { row[col] = carry[col].cell; carry[col].left--; col++; } }
        takeCarry();
        own.forEach(function (c) {
          takeCarry();
          var rs = parseInt(c.getAttribute("rowspan") || "1", 10) || 1, cs = parseInt(c.getAttribute("colspan") || "1", 10) || 1;
          for (var k = 0; k < cs; k++) { row[col] = c; if (rs > 1) carry[col] = { cell: c, left: rs - 1 }; col++; }
        });
        takeCarry();
        if (tr.querySelector("th") && !tr.querySelector("td")) return;       // header row
        var month = -1, day = 0, ttl = "", wiki = "";
        row.forEach(function (c) {
          if (!c) return;
          var t = (c.textContent || "").replace(/\s+/g, "");
          if (month < 0 && /^[A-Za-z]{3,9}$/.test(t)) { var mi = MONTHS.indexOf(t.slice(0, 3).toUpperCase()); if (mi >= 0 && t.length <= 9) month = mi; }
          else if (!day && /^\d{1,2}$/.test(t)) day = parseInt(t, 10);
          else if (!ttl) {
            var it = c.querySelector("i");
            if (it && it.textContent.trim()) {
              ttl = it.textContent.replace(/\s+/g, " ").trim();
              var a = it.querySelector("a[href^='/wiki/']");
              if (a) { try { wiki = decodeURIComponent(a.getAttribute("href").slice(6)).replace(/_/g, " ").split("#")[0]; } catch (e) {} }
            }
          }
        });
        if (month < 0 || !day || !ttl) return;
        var key = ttl.toLowerCase() + "|" + month + "|" + day;
        if (seen[key]) return; seen[key] = 1;
        out.push({ title: ttl, wiki: wiki, month: month, day: day, date: new Date(Date.UTC(year, month, day)).getTime() });
      });
    });
    return out;
  }
  function releases(year, force) {
    year = year || new Date().getFullYear();
    var key = "releases" + year, cached = null;
    try { cached = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) {}
    if (!force && cached && Date.now() - cached.t < 12 * 3600 * 1000 && cached.list && cached.list.length) return Promise.resolve(cached.list);
    var url = "https://en.wikipedia.org/w/api.php?action=parse&format=json&origin=*&prop=text&disablelimitreport=1&disabletoc=1&disableeditsection=1&formatversion=2&page=" + encodeURIComponent("List of American films of " + year);
    return withTimeout(http(url), 20000).then(function (d) {
      var html = d && d.parse && d.parse.text; if (html && typeof html === "object") html = html["*"];
      if (!html) throw new Error("no list for " + year);
      var list = parseReleaseTables(html, year);
      if (!list.length) throw new Error("couldn't read the release list");
      try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), list: list })); } catch (e) {}
      return list;
    }).catch(function (e) { if (cached && cached.list && cached.list.length) return cached.list; throw e; });
  }
  // Posters + short descriptions for a batch of Wikipedia page titles (50 per request)
  var infoCache = {};
  function filmInfo(titles) {
    var uniq = titles.filter(function (t, i) { return t && titles.indexOf(t) === i; }), jobs = [], res = {};
    var todo = uniq.filter(function (t) { if (infoCache[t]) { res[t] = infoCache[t]; return false; } return true; });
    for (var i = 0; i < todo.length; i += 50) (function (chunk) {
      var url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages|description&piprop=thumbnail&pithumbsize=330&pilimit=50&pilicense=any&titles=" + encodeURIComponent(chunk.join("|"));
      function once() { return withTimeout(http(url), 15000); }
      jobs.push(once().catch(function () { return new Promise(function (r) { setTimeout(r, 700); }).then(once); }).then(function (d) {
        var q = d && d.query || {}, map = {};
        if (!d || !d.query) return;
        (q.normalized || []).forEach(function (n) { map[n.to] = n.from; });
        var redir = {}; (q.redirects || []).forEach(function (r) { redir[r.to] = (map[r.from] || r.from); });
        var got = {};
        Object.keys(q.pages || {}).forEach(function (k) {
          var p = q.pages[k]; if (!p || p.missing !== undefined) return;
          var orig = redir[p.title] || map[p.title] || p.title;
          res[orig] = { id: String(p.pageid), poster: p.thumbnail && p.thumbnail.source || "", overview: p.description || "" };
          res[p.title] = res[orig]; got[orig] = got[p.title] = res[orig];
        });
        // remember only answers that worked, so a failed request is retried next time
        Object.keys(got).forEach(function (k) { if (got[k].poster) infoCache[k] = got[k]; });
      }).catch(function () {}));
    })(todo.slice(i, i + 50));
    return Promise.all(jobs).then(function () { return res; });
  }

  window.Lookup = {
    diagnose: diagnose,
    search: search, get: get, meta: meta, set: set, clear: clear, exportPosters: exportPosters, importPosters: importPosters,
    ready: ready, bulkRun: bulkRun, bulkCounts: bulkCounts, bulkCandidates: bulkCandidates, _pack: pack, _unpack: unpack,
    onChange: function (f) { listeners.push(f); }, posterByName: posterByName, nextEpisode: nextEpisode, newFilms: newFilms, newSeries: newSeries, _premiereDate: premiereDate, releases: releases, filmInfo: filmInfo, genreFor: genreFor, genreFromText: genreFromText, _parseReleases: parseReleaseTables, yearFor: yearFor, applyYears: applyYears, norm: norm
  };
})();
