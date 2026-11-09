/* New restaurant / bar openings, read from Athinorama's own listing pages.
   More sources can be added to SOURCES (a section name + the page address). */
(function () {
  "use strict";
  // Each source: where to read, which links are articles, and which kind(s) it feeds.
  // "broad" sources mix in other topics, so a headline must also sound like food/drink.
  var SOURCES = [
    { id: "athinorama-food", name: "Athinorama", kinds: ["Food"], url: "https://www.athinorama.gr/restaurants", section: "restaurants",
      pageUrl: function (n) { return "https://www.athinorama.gr/restaurants/?page=" + n + "&iscroll=1"; } },
    { id: "athinorama-bars", name: "Athinorama", kinds: ["Drinks"], url: "https://www.athinorama.gr/clubbing", section: "clubbing",
      pageUrl: function (n) { return "https://www.athinorama.gr/clubbing/?page=" + n + "&iscroll=1"; } },
    { id: "athensvoice-themata", name: "Athens Voice", kinds: ["Food", "Drinks"], url: "https://www.athensvoice.gr/life/geusi/themata/", host: "https://www.athensvoice.gr",
      linkRe: /\/life\/geusi\/(?:themata|resto)\/(\d{5,})\/[^\/?#]+/ },
    { id: "athensvoice-resto", name: "Athens Voice", kinds: ["Food", "Drinks"], url: "https://www.athensvoice.gr/life/geusi/resto/", host: "https://www.athensvoice.gr",
      linkRe: /\/life\/geusi\/(?:themata|resto)\/(\d{5,})\/[^\/?#]+/ },
    { id: "lifo-eat", name: "LiFO", kinds: ["Food", "Drinks"], url: "https://www.lifo.gr/arxeio/eat", host: "https://www.lifo.gr", broad: true,
      linkRe: /lifo\.gr\/(?:[a-z0-9-]+\/){1,3}([a-z0-9-]{14,})\/?$/ },
    { id: "newmoney-fine", name: "Newmoney", kinds: ["Food", "Drinks"], url: "https://www.newmoney.gr/category/fine-living/", host: "https://www.newmoney.gr", broad: true,
      linkRe: /newmoney\.gr\/journal\/([^\/?#]+)/ },
    { id: "newmoney-10", name: "Newmoney", kinds: ["Food"], host: "https://www.newmoney.gr", fixed:
      [{ title: "10 νέα εστιατόρια που ανοίγουν στην Αθήνα το φθινόπωρο", url: "https://www.newmoney.gr/journal/10-νέα-εστιατόρια-που-ανοίγουν-στην-αθήν/" }] }
  ];
  function forKind(k) { return SOURCES.filter(function (x) { return x.kinds.indexOf(k) >= 0; }); }
  var FOOD_WORDS = /εστιατόρ|μπαρ|ταβέρν|στέκι|στέκια|καφέ|καφενε|φαγητ|γεύσ|εστίασ|bistro|restaurant|cocktail|κοκτέιλ|κρασ|pizza|πίτσα|burger|μπιστρό|μαγειρ|σεφ|ψητοπωλ|ουζερ|μεζε|brunch|bakery|φούρν|ζαχαροπλ|παγωτ/i;
  var ROUNDUP = /^\s*\d+\s|\bτα νέα\b|νέα στέκια|νέα εστιατόρια|νέα μπαρ|νέες αφίξεις|άνοιγμα|ανοίγματα/i;
  var NEW_WORDS = /νέο|νέα|νέος|νέες|ανοίγ|άνοιξ|ανοιγμ|έρχεται|έρχονται|εμφανίστηκ|πρώτο|πρώτη|pop[- ]?up|opening|\bnew\b|επιστρέφ|μεταφέρ|αλλάζ/i;
  var state = { kind: "Food", onlyNew: true, items: {}, page: {}, failed: [], q: "", found: [], searching: false, searchErr: "" };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function getText(url) {
    var cap = null;
    try { cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp; } catch (e) {}
    if (cap && cap.get) return cap.get({ url: url, headers: { "Accept": "text/html,*/*", "Accept-Language": "el,en;q=0.8" }, responseType: "text" }).then(function (r) {
      if (r && r.status && r.status >= 400) throw new Error("HTTP " + r.status);
      return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    });
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
  }

  // Pull the article links out of a listing page. Newest articles have the highest id.
  function parseListing(html, section) {
    var doc = new DOMParser().parseFromString(html, "text/html"), seen = {}, out = [];
    var re = new RegExp("/" + section + "/(brandvoice/)?(\\d{5,})/([^/?#]+)");
    doc.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href") || "", m = re.exec(href);
      if (!m || /restaurants-reviews/.test(href)) return;
      var img = a.querySelector("img"), title = (a.getAttribute("title") || "").trim();
      if (!title) title = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!title && img) title = (img.getAttribute("alt") || "").trim();
      title = title.replace(/\s+/g, " ");
      if (title.length < 8) return;
      var pic = "";
      if (img) ["data-src", "data-original", "data-lazy-src", "src"].some(function (k) { var v = img.getAttribute(k); if (v && !/noimage/i.test(v) && !/^data:/.test(v)) { pic = v; return true; } return false; });
      if (pic && pic.indexOf("//") === 0) pic = "https:" + pic; else if (pic && pic.charAt(0) === "/") pic = "https://www.athinorama.gr" + pic;
      var link = href.charAt(0) === "/" ? "https://www.athinorama.gr" + href : href;
      var id = m[2], cur = seen[id];
      if (cur) { if (title.length > cur.title.length) cur.title = title; if (!cur.pic && pic) cur.pic = pic; return; }
      seen[id] = { id: id, title: title, url: link, pic: pic, sponsored: !!m[1] };
      out.push(seen[id]);
    });
    out.sort(function (a, b) { return Number(b.id) - Number(a.id); });
    return out;
  }
  function plain(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ς/g, "σ"); }
  // Greek (or Latin) area words in a headline -> the same labels your Food and Drinks filters already use
  var AREAS = [
    [/κολωνακ|kolonaki/, "Kolonaki"], [/ψυρρ|psyrri|psiri/, "Monastiraki · Psyrri"], [/μοναστηρακ|monastiraki/, "Monastiraki · Psyrri"],
    [/θησει|thissio|thiseio|γκαζι|gazi\b/, "Thissio · Gazi"], [/πλακα\b|πλακα |πλακασ|plaka|συνταγμ|syntagma/, "Syntagma · Plaka"],
    [/κεραμεικ|keramikos/, "Keramikos"], [/κουκακ|koukaki/, "Koukaki"], [/κυψελ|kypseli|φωκιωνοσ νεγρη/, "Kypseli"], [/εξαρχει|exarchia|exarcheia/, "Exarchia"],
    [/παγκρατ|pangrati/, "Pangrati"], [/καλλιθε|kallithea/, "Kallithea"], [/ιλισι|ilisia/, "Ilisia"], [/μεταξουργει|metaxourgeio/, "Metaxourgeio"],
    [/νεο[σν]? κοσμ|neos kosmos/, "Neos Kosmos"], [/αμπελοκηπ|ampelokipi/, "Ampelokipi"], [/χαλανδρ|chalandri|halandri/, "Chalandri"],
    [/γλυφαδ|glyfada/, "Glyfada"], [/νεα σμυρν|nea smyrni/, "Nea Smyrni"], [/περιστερι|peristeri/, "Peristeri"], [/ψυχικ|psychiko/, "Psychiko"],
    [/κηφισι|kifisia|kifissia/, "Kifisia"], [/μαρουσι|marousi/, "Marousi"], [/πετραλων|petralona/, "Petralona"], [/ομονοι|omonia|omonoia/, "Omonia"],
    [/παλαιο φαληρ|palaio faliro/, "Palaio Faliro"], [/φαληρ|faliro/, "Faliro"], [/αλιμ|alimos/, "Alimos"], [/βυρων|vyronas/, "Vyronas"],
    [/ιλιου|ilion\b/, "Ilion"], [/ηλιουπολ|ilioupoli/, "Ilioupoli"], [/αγια παρασκευ|agia paraskevi/, "Agia Paraskevi"], [/νικαια|nikaia/, "Nikaia"],
    [/αιγαλε|egaleo/, "Egaleo"], [/ζωγραφ|zografou/, "Zografou"], [/μοσχατ|moschato/, "Moschato"], [/φιλοθε|filothei/, "Filothei"],
    [/πεντελ|penteli/, "Penteli"], [/βριλησσ|vrilissia/, "Vrilissia"], [/χολαργ|cholargos/, "Cholargos"], [/παπαγου|papagou/, "Papagou"],
    [/γαλατσ|galatsi/, "Galatsi"], [/πειραι|piraeus|piraeus/, "Piraeus"], [/βουλιαγμεν|vouliagmeni/, "Vouliagmeni"], [/βουλα\b|voula\b/, "Voula"],
    [/λυκαβηττ|lycabettus|lykavittos/, "Lycabettus"], [/μακρυγιαν|makrygianni/, "Makrygianni"], [/ακροπολ|acropolis/, "Acropolis"],
    [/παλαιο ψυχικ|neo ψυχικ|neo psychiko/, "Neo Psychiko"], [/ανω πετραλων/, "Petralona"], [/αγιου δημητρ|agios dimitrios/, "Agios Dimitrios"]
  ];
  function guessRegion(title) {
    var t = " " + plain(title) + " ", best = null;
    // prefer the area that follows "στο / στη / στην / στον / στα / σε"
    var m = /\s(?:στο|στη|στην|στον|στα|στισ|σε|at|in)\s+([^,.:;()–-]{3,30})/.exec(t);
    if (m) AREAS.some(function (a) { if (a[0].test(" " + m[1] + " ")) { best = a[1]; return true; } return false; });
    if (!best) AREAS.some(function (a) { if (a[0].test(t)) { best = a[1]; return true; } return false; });
    if (!best) return "";
    // reuse the exact spelling already in your list when it differs only in case
    try {
      var all = JSON.parse(localStorage.getItem("entries")) || [];
      for (var i = 0; i < all.length; i++) { var r = all[i].region || all[i].drinkType; if (r && String(r).toLowerCase() === best.toLowerCase()) return r; }
    } catch (e) {}
    return best;
  }
  // The place name inside a headline:  "Casa Kiku: το δημοφιλές…" -> Casa Kiku,  "Το «Kadro» …" -> Kadro,  "Το Brutus Tavern επιστρέφει…" -> Brutus Tavern
  function guessName(title) {
    title = String(title || "").trim();
    var q = /[«“"‘]\s*([^»”"’]{2,40}?)\s*[»”"’]/.exec(title) || /(?:^|[\s(])'\s*([^']{2,40}?)\s*'(?=[\s,.:;)]|$)/.exec(title);
    if (q) return q[1].trim();
    var c = title.indexOf(":");
    if (c > 1 && c <= 42 && title.slice(0, c).trim().split(/\s+/).length <= 5) return title.slice(0, c).trim();
    var words = title.split(/\s+/), ART = /^(το|η|ο|τα|οι|ένα|ενα|μια|μία|νέο|νέα|νεο|πώς|ποιο|ποια|ποιος)$/i;
    var i = 0; while (i < words.length - 1 && ART.test(words[i].replace(/[,.:;]/g, ""))) i++;
    var run = [];
    for (var j = i; j < words.length && run.length < 3; j++) {
      var w = words[j].replace(/[,.:;!?]+$/, "");
      if (!run.length && j > i + 1) break;
      if (/^[A-ZΑ-ΩΆ-Ώ][\wά-ώΑ-Ωα-ωA-Za-z'’&.-]*$/.test(w) && !ART.test(w)) run.push(w); else if (run.length) break; else if (j > i + 1) break;
      if (/[,.:;]$/.test(words[j])) break;
    }
    if (run.length) return run.join(" ");
    var lat = /\b([A-Za-z][A-Za-z'’&-]{3,24})\b/.exec(title);   // e.g. "το ασιατικό tavernaki του …"
    return lat && !/^(resto|concept|bistro|bar|cafe|menu|brunch|street|food|pop|restaurant|cocktail|wine)$/i.test(lat[1]) ? lat[1].charAt(0).toUpperCase() + lat[1].slice(1) : title;
  }
  function abs(href, host) { if (!href) return ""; if (href.indexOf("//") === 0) return "https:" + href; if (href.charAt(0) === "/") return host + href; return href; }
  function canon(u) { return String(u).replace(/[?#].*$/, "").replace(/\/amp\/?$/, "/").replace(/\/?$/, "/"); }
  // Generic: every link whose address looks like one of the site's articles.
  function parseGeneric(html, src) {
    var doc = new DOMParser().parseFromString(html, "text/html"), seen = {}, out = [];
    doc.querySelectorAll("a[href]").forEach(function (a) {
      var url = canon(abs(a.getAttribute("href") || "", src.host)), m = src.linkRe.exec(url);
      if (!m) return;
      var img = a.querySelector("img"), title = (a.getAttribute("title") || "").trim();
      if (!title) title = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!title && img) title = (img.getAttribute("alt") || "").trim();
      title = title.replace(/\s+/g, " ");
      if (title.length < 14) return;
      var pic = "";
      if (img) ["data-src", "data-original", "data-lazy-src", "src"].some(function (k) { var v = img.getAttribute(k); if (v && !/noimage|logo|^data:/i.test(v)) { pic = abs(v, src.host); return true; } return false; });
      var cur = seen[url];
      if (cur) { if (title.length > cur.title.length) cur.title = title; if (!cur.pic && pic) cur.pic = pic; return; }
      seen[url] = { id: src.id + ":" + url, title: title, url: url, pic: pic, source: src.name, rank: out.length };
      out.push(seen[url]);
    });
    return out;
  }
  function ogImage(url) {
    return getText(url).then(function (h) {
      var m = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(h) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(h);
      return m ? m[1].replace(/&amp;/g, "&") : "";
    });
  }

  function cacheGet(key) { try { var c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.t < 3 * 3600e3 && c.list && c.list.length) return c.list; } catch (e) {} return null; }
  function cachePut(key, list) { if (list.length) { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), list: list })); } catch (e) {} } }

  // One source, one page -> list of items
  function loadSource(src, page) {
    if (src.fixed) return Promise.resolve(src.fixed.map(function (f, i) { return { id: src.id + ":" + f.url, title: f.title, url: f.url, pic: "", source: src.name, rank: i }; }));
    var key = "openings." + src.id + "." + page, hit = cacheGet(key);
    if (hit) return Promise.resolve(hit);
    var url = page === 1 ? src.url : src.pageUrl(page);
    return getText(url).then(function (html) {
      var list;
      if (src.section) list = parseListing(html, src.section).map(function (x, i) { return { id: src.id + ":" + x.id, num: Number(x.id), title: x.title, url: x.url, pic: x.pic, sponsored: x.sponsored, source: src.name, rank: i }; });
      else list = parseGeneric(html, src);
      cachePut(key, list); return list;
    });
  }
  function keep(x, src, kind) {
    if (src.broad && !FOOD_WORDS.test(x.title)) return false;
    if (src.kinds.length > 1) {   // shared sources: send bar talk to Drinks, the rest to Food
      var bar = /μπαρ|cocktail|κοκτέιλ|\bbar\b|wine bar|κρασ|μπύρ|beer|ποτ[όά]/i.test(x.title);
      if (kind === "Drinks" && !bar) return false;
      if (kind === "Food" && bar && !/εστιατόρ|ταβέρν|φαγητ|bistro/i.test(x.title)) return false;
    }
    return true;
  }
  // merge sources: newest-first inside each, and take turns so one site doesn't bury the others
  function merge(kind, lists) {
    var out = [], seen = {}, max = Math.max.apply(null, lists.map(function (l) { return l.length; }).concat([0]));
    for (var i = 0; i < max; i++) lists.forEach(function (l) { var x = l[i]; if (x && !seen[x.url]) { seen[x.url] = 1; out.push(x); } });
    return out;
  }
  function loadKind(kind, page) {
    var srcs = forKind(kind).filter(function (s) { return page === 1 || s.pageUrl; }), failed = [], failN = 0;
    return Promise.all(srcs.map(function (s) {
      return loadSource(s, page).then(function (l) { return l.filter(function (x) { return keep(x, s, kind); }); }, function (e) { failN++; if (failed.indexOf(s.name) < 0) failed.push(s.name); return []; });
    })).then(function (lists) { return { items: merge(kind, lists), failed: failed, ok: srcs.filter(function (x) { return !x.fixed; }).length - failN }; });
  }


  // ---- search the same sites for any place (not only new ones) ----
  var DOMAINS = [["athinorama.gr", "Athinorama"], ["athensvoice.gr", "Athens Voice"], ["lifo.gr", "LiFO"], ["newmoney.gr", "Newmoney"]];
  function domainName(u) { var h = String(u).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]; var d = DOMAINS.filter(function (x) { return h === x[0] || h.slice(-x[0].length - 1) === "." + x[0]; })[0]; return d ? d[1] : ""; }
  function searchDDG(q) {
    var sites = DOMAINS.map(function (d) { return "site:" + d[0]; }).join(" OR ");
    var url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent("(" + sites + ") " + q);
    return getText(url).then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html"), out = [];
      doc.querySelectorAll(".result").forEach(function (r) {
        var a = r.querySelector("a.result__a"); if (!a) return;
        var href = a.getAttribute("href") || "", m = /[?&]uddg=([^&]+)/.exec(href);
        var link = m ? decodeURIComponent(m[1]) : href; if (link.indexOf("//") === 0) link = "https:" + link;
        var src = domainName(link); if (!src) return;
        var sn = r.querySelector(".result__snippet");
        out.push({ id: "q:" + link, title: (a.textContent || "").replace(/\s+/g, " ").trim(), url: link, pic: "", source: src, snippet: sn ? sn.textContent.replace(/\s+/g, " ").trim() : "" });
      });
      if (!out.length && /anomaly|captcha|unusual traffic/i.test(html)) throw new Error("the search engine is busy");
      return out;
    });
  }
  function b64url(t) { try { t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return decodeURIComponent(escape(atob(t))); } catch (e) { return ""; } }
  function searchBing(q) {
    var sites = DOMAINS.map(function (d) { return "site:" + d[0]; }).join(" OR ");
    var url = "https://www.bing.com/search?setlang=el&q=" + encodeURIComponent("(" + sites + ") " + q);
    return getText(url).then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html"), out = [];
      doc.querySelectorAll("li.b_algo, .b_algo").forEach(function (r) {
        var a = r.querySelector("h2 a"); if (!a) return;
        var link = a.getAttribute("href") || "", m = /[?&]u=a1([^&]+)/.exec(link);
        if (m) link = b64url(m[1]) || link;
        var src = domainName(link); if (!src) return;
        var sn = r.querySelector(".b_caption p, .b_lineclamp2, p");
        out.push({ id: "q:" + link, title: (a.textContent || "").replace(/\s+/g, " ").trim(), url: link, pic: "", source: src, snippet: sn ? sn.textContent.replace(/\s+/g, " ").trim() : "" });
      });
      if (!out.length && !doc.querySelector(".b_algo")) throw new Error("the page didn't load properly");
      return out;
    });
  }
  // try the engines in turn until one gives answers
  function searchWeb(q) {
    var errs = [];
    return searchDDG(q).catch(function (e) { errs.push("DuckDuckGo: " + ((e && e.message) || "failed")); return []; }).then(function (r) {
      if (r.length) return r;
      return searchBing(q).catch(function (e) { errs.push("Bing: " + ((e && e.message) || "failed")); return []; });
    }).then(function (r) { if (!r.length && errs.length) throw new Error(errs.join("; ")); return r; });
  }
  function searchNewmoney(q) {
    var src = SOURCES.filter(function (x) { return x.id === "newmoney-fine"; })[0];
    return getText("https://www.newmoney.gr/?s=" + encodeURIComponent(q)).then(function (h) { return parseGeneric(h, src).map(function (x) { x.id = "q:" + x.url; x.snippet = ""; return x; }); });
  }
  // Athens Voice has its own search page: /search/?q=...
  function searchAthensVoice(q) {
    var src = { id: "av-search", name: "Athens Voice", host: "https://www.athensvoice.gr", linkRe: /^https:\/\/www\.athensvoice\.gr\/[a-z0-9_\-\/]*\/\d{5,}\/[^?#\s]+/i };
    return getText("https://www.athensvoice.gr/search/?q=" + encodeURIComponent(q) + "&section=Articles&category=" + encodeURIComponent("Life in Athens")).then(function (h) {
      return parseGeneric(h, src).map(function (x) { x.id = "q:" + x.url; x.snippet = ""; return x; });
    });
  }
  function runSearch(q) {
    q = String(q || "").trim();
    if (!q) { state.q = ""; render(); return; }
    state.q = q; state.searching = true; state.searchErr = ""; state.found = []; render();
    var errs = [];
    Promise.all([searchWeb(q).catch(function (e) { errs.push((e && e.message) || "failed"); return []; }), searchNewmoney(q).catch(function () { return []; }), searchAthensVoice(q).catch(function () { return []; })]).then(function (r) {
      var seen = {}, all = [];
      r[2].concat(r[0], r[1]).forEach(function (x) { var k = canon(x.url); if (!seen[k]) { seen[k] = 1; all.push(x); } });
      state.found = all; state.searching = false;
      if (!all.length && errs.length) state.searchErr = errs[0];
      render();
    });
  }
  function norm(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ς/g, "σ"); }
  function nameForResult(x) { return norm(x.title).indexOf(norm(state.q)) >= 0 ? state.q.trim() : guessName(x.title); }
  function googleUrl(q) { return "https://www.google.com/search?q=" + encodeURIComponent("(" + DOMAINS.map(function (d) { return "site:" + d[0]; }).join(" OR ") + ") " + q); }
  function renderSearch(box) {
    if (state.searching) { box.innerHTML = '<p class="pick-empty">Searching Athinorama, Athens Voice, LiFO and Newmoney…</p>'; return; }
    var g = '<a class="btn btn-light w-100 mt-2" target="_blank" rel="noopener" href="' + esc(googleUrl(state.q)) + '">Search on Google instead</a>';
    if (!state.found.length) { box.innerHTML = '<p class="pick-empty">' + (state.searchErr ? "Couldn\'t search right now (" + esc(state.searchErr) + ")." : "No articles found for “" + esc(state.q) + "”.") + '</p>' + g; return; }
    box.innerHTML = state.found.map(function (x) {
      return '<div class="op-row" data-id="' + esc(x.id) + '"><div class="op-pic"><span>' + (state.kind === "Food" ? "🍽" : "🍸") + '</span></div><div class="op-mid"><div class="op-t">' + esc(x.title) + '</div>' +
        (x.snippet ? '<div class="op-snip">' + esc(x.snippet.slice(0, 140)) + '</div>' : "") +
        '<div class="op-tags"><span class="op-tag">' + esc(x.source) + '</span></div><div class="op-btns"><a class="op-open" target="_blank" rel="noopener" href="' + esc(x.url) + '">Read</a>' +
        '<button type="button" class="op-add" data-id="' + esc(x.id) + '">+ Add</button></div></div></div>';
    }).join("") + g;
    box.querySelectorAll(".op-add").forEach(function (b) { b.onclick = function () {
      var x = state.found.filter(function (i) { return i.id === b.dataset.id; })[0]; if (!x) return;
      close(); if (window.openEntryPrefilled) window.openEntryPrefilled(state.kind, nameForResult(x), guessRegion(x.title + " " + (x.snippet || "")));
    }; });
    fillImages(state.found);
  }

  function ensureSheet() {
    if ($("opOv")) return;
    var d = document.createElement("div");
    d.innerHTML = '<div class="op-ov" id="opOv"></div><div class="op-sheet" id="opSheet" role="dialog" aria-label="New openings">' +
      '<div class="op-grab"></div><div class="op-h">New openings</div><div class="op-src">Athinorama · Athens Voice · LiFO · Newmoney</div>' +
      '<form class="op-search" id="opForm"><input type="search" id="opQ" placeholder="Search these sites for a place…" enterkeyhint="search" autocomplete="off"><button type="submit" aria-label="Search" id="opGo">🔍</button></form>' +
      '<div class="nf-kinds" id="opKinds"></div>' +
      '<div class="op-opts"><button type="button" class="chip" id="opOnly"></button></div>' +
      '<div class="op-list" id="opList"></div>' +
      '<div class="op-foot"><button type="button" class="btn btn-light" id="opClose">Close</button></div></div>';
    document.body.appendChild(d);
    $("opOv").onclick = close; $("opClose").onclick = close;
    $("opOnly").onclick = function () { state.onlyNew = !state.onlyNew; render(); };
    $("opForm").onsubmit = function (e) { e.preventDefault(); runSearch($("opQ").value); };
    $("opQ").addEventListener("input", function () { if (!this.value.trim() && state.q) { state.q = ""; render(); } });
  }
  function close() { if ($("opOv")) { $("opOv").classList.remove("show"); $("opSheet").classList.remove("show"); } }

  function rowHtml(x, kind) {
    var round = ROUNDUP.test(x.title);
    return '<div class="op-row" data-id="' + esc(x.id) + '"><div class="op-pic" style="' + (x.pic ? "background-image:url('" + esc(x.pic) + "')" : "") + '">' + (x.pic ? "" : '<span>' + (kind === "Food" ? "🍽" : "🍸") + '</span>') + '</div>' +
      '<div class="op-mid"><div class="op-t">' + esc(x.title) + '</div><div class="op-tags"><span class="op-tag">' + esc(x.source) + '</span>' + (x.sponsored ? '<span class="op-tag">Sponsored</span>' : "") + '</div>' +
      '<div class="op-btns"><a class="op-open" target="_blank" rel="noopener" href="' + esc(x.url) + '">Read</a>' +
      (round ? '<button type="button" class="op-in" data-id="' + esc(x.id) + '">Places inside</button>' : "") +
      '<button type="button" class="op-add" data-id="' + esc(x.id) + '">+ Add</button></div><div class="op-places" data-for="' + esc(x.id) + '"></div></div></div>';
  }
  function render() {
    var kind = state.kind;
    $("opKinds").innerHTML = ["Food", "Drinks"].map(function (k) { return '<button type="button" class="chip' + (k === kind ? " is-active" : "") + '" data-k="' + k + '">' + (k === "Food" ? "Restaurants" : "Bars") + '</button>'; }).join("");
    $("opKinds").querySelectorAll("button").forEach(function (b) { b.onclick = function () { state.kind = b.dataset.k; start(); }; });
    var inSearch = !!state.q;
    $("opKinds").style.display = $("opOnly").parentNode.style.display = inSearch ? "none" : "";
    if (inSearch) { renderSearch($("opList")); return; }
    $("opOnly").textContent = state.onlyNew ? "Only openings ✓" : "Everything";
    $("opOnly").classList.toggle("is-active", state.onlyNew);
    var box = $("opList"), all = state.items[kind] || [], items = state.onlyNew ? all.filter(function (x) { return NEW_WORDS.test(x.title); }) : all;
    var note = state.failed.length ? '<p class="op-warn">Couldn\'t read: ' + esc(state.failed.join(", ")) + '</p>' : "";
    if (state.loading) { box.innerHTML = '<p class="pick-empty">Looking for new places…</p>'; return; }
    if (state.error) { box.innerHTML = '<p class="pick-empty">Couldn\'t read any of the sites (' + esc(state.error) + '). ' + (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() ? "Check your connection." : "This works inside the phone app; a browser blocks it.") + '</p><button class="btn btn-secondary w-100" id="opRetry">Try again</button>'; $("opRetry").onclick = function () { start(true); }; return; }
    if (!items.length) { box.innerHTML = note + '<p class="pick-empty">' + (all.length ? "No openings in this batch. Turn off “Only openings” or load more." : "Nothing found right now.") + '</p>' + moreBtn(); wireMore(); return; }
    box.innerHTML = note + items.map(function (x) { return rowHtml(x, kind); }).join("") + moreBtn();
    box.querySelectorAll(".op-add").forEach(function (b) { b.onclick = function () { add(b.dataset.id); }; });
    box.querySelectorAll(".op-in").forEach(function (b) { b.onclick = function () { inside(b.dataset.id); }; });
    wireMore(); fillImages(items);
  }
  function moreBtn() { return '<button type="button" class="btn btn-light w-100 mt-2" id="opMore">Load more</button>'; }
  function wireMore() { var b = $("opMore"); if (b) b.onclick = function () { more(); }; }

  var imgBusy = 0;
  function fillImages(items) {
    items.slice(0, 12).forEach(function (x) {
      if (x.pic || x.tried || imgBusy >= 4) return;
      var cache = {}; try { cache = JSON.parse(localStorage.getItem("openings.img") || "{}"); } catch (e) {}
      if (cache[x.url]) { x.pic = cache[x.url]; paint(x); return; }
      x.tried = true; imgBusy++;
      ogImage(x.url).then(function (u) { if (u) { x.pic = u; cache[x.url] = u; try { localStorage.setItem("openings.img", JSON.stringify(cache)); } catch (e) {} paint(x); } }).catch(function () {}).then(function () { imgBusy--; });
    });
  }
  function rowEl(id) { return Array.prototype.filter.call(document.querySelectorAll(".op-row"), function (e) { return e.dataset.id === id; })[0]; }
  function paint(x) { var r = rowEl(x.id), el = r && r.querySelector(".op-pic"); if (el) { el.style.backgroundImage = "url('" + x.pic.replace(/'/g, "%27") + "')"; el.innerHTML = ""; } }
  function find(id) { return (state.items[state.kind] || []).filter(function (i) { return i.id === id; })[0]; }

  // A roundup article ("10 new restaurants…"): list the bold/heading names so each place can be added on its own
  function placeNames(html) {
    var doc = new DOMParser().parseFromString(html, "text/html"), root = doc.querySelector("article, .entry-content, .post-content, main") || doc.body, seen = {}, out = [];
    root.querySelectorAll("strong, b, h2, h3, h4").forEach(function (el) {
      var t = (el.textContent || "").replace(/\s+/g, " ").trim().replace(/^\d{1,2}\s*[.)–-]\s*/, "").replace(/[:.\s]+$/, "");
      if (t.length < 2 || t.length > 45 || t.split(" ").length > 6) return;
      if (/^(φωτ|photo|διαβάστε|δείτε|διαβαστε|σχόλια|μοιραστείτε|facebook|twitter|tags?|επίσης|ακολουθήστε|newmoney|lifo)/i.test(t)) return;
      var k = t.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(t);
    });
    return out.slice(0, 25);
  }
  function inside(id) {
    var x = find(id); if (!x) return;
    var box = document.querySelector('.op-places[data-for="' + id.replace(/"/g, "") + '"]'); if (!box) return;
    if (box.dataset.open === "1") { box.innerHTML = ""; box.dataset.open = ""; return; }
    box.dataset.open = "1"; box.innerHTML = '<span class="op-note">Reading the article…</span>';
    getText(x.url).then(function (h) {
      var names = placeNames(h);
      box.innerHTML = names.length ? names.map(function (n) { return '<button type="button" class="op-place" data-n="' + esc(n) + '">+ ' + esc(n) + '</button>'; }).join("") : '<span class="op-note">Couldn\'t find place names in this article.</span>';
      box.querySelectorAll(".op-place").forEach(function (b) { b.onclick = function () { close(); if (window.openEntryPrefilled) window.openEntryPrefilled(state.kind, b.dataset.n); }; });
    }).catch(function () { box.innerHTML = '<span class="op-note">Couldn\'t open the article.</span>'; });
  }
  function add(id) {
    var x = find(id); if (!x) return;
    close();
    if (window.openEntryPrefilled) window.openEntryPrefilled(state.kind, guessName(x.title), guessRegion(x.title));
  }
  function more() {
    var kind = state.kind, p = (state.page[kind] || 1) + 1, box = $("opList"), top = box.scrollTop, btn = $("opMore");
    if (btn) { btn.disabled = true; btn.textContent = "Loading…"; }
    loadKind(kind, p).then(function (r) {
      var have = {}; (state.items[kind] || []).forEach(function (i) { have[i.url] = 1; });
      var fresh = r.items.filter(function (i) { return !have[i.url]; });
      fresh.forEach(function (i) { state.items[kind].push(i); });
      if (fresh.length) state.page[kind] = p;
      render(); box.scrollTop = top;   // stay where you were; the new items appear below
      if (!fresh.length && window.Share && Share.toast) Share.toast("No more to load");
    });
  }
  function start(force) {
    var kind = state.kind; state.error = ""; state.failed = []; state.page[kind] = 1;
    if (force) { try { Object.keys(localStorage).filter(function (k) { return k.indexOf("openings.") === 0 && k !== "openings.img"; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} }
    state.loading = true; render();
    loadKind(kind, 1).then(function (r) {
      state.items[kind] = r.items; state.failed = r.failed; state.loading = false;
      if (r.ok === 0 && r.failed.length) { state.error = "no connection"; state.failed = []; }
      render();
    });
  }
  function open(kind) {
    state.kind = kind === "Drinks" ? "Drinks" : "Food";
    ensureSheet(); $("opOv").classList.add("show"); $("opSheet").classList.add("show");
    state.q = ""; $("opQ").value = "";
    start();
  }
  window.Openings = { searchBing: searchBing, open: open, close: close, parseListing: parseListing, parseGeneric: parseGeneric, placeNames: placeNames, guessName: guessName, guessRegion: guessRegion, _state: state, _sources: SOURCES };
})();
