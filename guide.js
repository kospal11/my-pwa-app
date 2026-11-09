/* Athinorama restaurant guide: browse by cuisine, area or price and add a place with its details filled in.
   Reads https://www.athinorama.gr/restaurants/guide (one filter at a time, ?page=N for more). */
(function () {
  "use strict";
  var BASE = "https://www.athinorama.gr/restaurants/guide";
  var CUISINE = [
    ["Ιταλική", "italiki"], ["Γιαπωνέζικη", "giaponeziki"], ["Γαλλική", "galliki"], ["Κινέζικη", "kineziki"], ["Ταϊλανδέζικη", "tailandeziki"], ["Ινδική/Πακιστανική", "indiki_pakistaniki"],
    ["Μεξικάνικη/Tex-Mex", "meksikaniki_tex-mex"], ["Περουβιανή/Nikkei", "peroubiani_nikkei"], ["Πολίτικη κουζίνα", "politiki_kouzina"], ["Βιετναμέζικη", "bietnameziki"], ["Multi-ethnic", "multi-ethnic"],
    ["Ελληνική μοντέρνα", "elliniki_monterna_kouzina"], ["Ελληνική παραδοσιακή", "elliniki_paradosiaki_kouzina"], ["Ταβέρνες / Μεζεδοπωλεία", "tabernes__mezedopoleia"],
    ["Ψαροταβέρνες", "psarotabernes"], ["Κρητική κουζίνα", "kritiki_kouzina"], ["Εστιατόρια για κρέας", "estiatoria_gia_kreas"], ["Ψάρι & θαλασσινά", "estiatoria_gia_psari_and_thalassina"],
    ["Pizza", "pizza"], ["Burgers", "burgers"], ["Σουβλάκι", "soublaki"], ["Street food", "street_food"], ["Vegetarian & vegan", "vegetarian_and_vegan"], ["All day food", "all_day_food"],
    ["Bar-restaurants", "bar-restaurants"], ["Wine bars/restaurants", "wine_bars_restaurants"], ["Pastry shop", "pastry_shop"], ["Μπιραρίες", "mpiraries"], ["Μοντέρνα κουζίνα", "monterna_kouzina"],
    ["Χρυσοί Σκούφοι 2025", "xrusoi_skoufoi_2025"]
  ];
  var BARS = [["Bars", "bars"], ["Clubs & Bars", "clubs_and_bars"], ["Wine bars/restaurants", "wine_bars_restaurants"], ["Bar-restaurants", "bar-restaurants"], ["Μπιραρίες", "mpiraries"]];
  var AREA = [
    ["Κολωνάκι", "kolonaki"], ["Κέντρο", "kentro"], ["Πλάκα", "plaka"], ["Ψυρρή", "psurri"], ["Μοναστηράκι", "monastiraki"], ["Θησείο", "thiseio"], ["Γκάζι", "gkazi"], ["Κεραμεικός", "kerameikos"],
    ["Μεταξουργείο", "metaksourgeio"], ["Εξάρχεια", "eksarxeia"], ["Κουκάκι", "koukaki"], ["Μακρυγιάννη", "makrugianni"], ["Παγκράτι", "pagkrati"], ["Πετράλωνα", "petralona"], ["Νέος Κόσμος", "neos_kosmos"],
    ["Κυψέλη", "kupseli"], ["Ιλίσια", "ilisia"], ["Αμπελόκηποι", "ampelokipoi"], ["Λυκαβηττός", "lukabittos"], ["Πλ. Βικτωρίας", "pl_biktorias"], ["Πατήσια", "patisia"], ["Βοτανικός", "botanikos"],
    ["Χαλάνδρι", "xalandri"], ["Μαρούσι", "marousi"], ["Κηφισιά", "kifisia"], ["Νέα Ερυθραία", "nea_eruthraia"], ["Ψυχικό", "psuxiko"], ["Φιλοθέη", "filothei"], ["Αγ. Παρασκευή", "ag_paraskeui"],
    ["Παπάγου", "papagou"], ["Χολαργός", "xolargos"], ["Νέα Ιωνία", "nea_ionia"], ["Γλυφάδα", "glufada"], ["Βούλα", "boula"], ["Βουλιαγμένη", "bouliagmeni"], ["Παλαιό Φάληρο", "palaio_faliro"],
    ["Καλλιθέα", "kallithea"], ["Νέα Σμύρνη", "nea_smurni"], ["Ζωγράφου", "zografou"], ["Βύρωνας", "buronas"], ["Πειραιάς", "peiraias"], ["Μικρολίμανο", "mikrolimano"], ["Περιστέρι", "peristeri"],
    ["Αιγάλεω", "aigaleo"], ["Μοσχάτο", "mosxato"], ["Άλιμος", "alimos"], ["Ηλιούπολη", "ilioupoli"], ["Παιανία", "paiania"], ["Ραφήνα", "rafina"], ["Σούνιο", "sounio"]
  ];
  var PRICE = [["€ · under 20€", "€"], ["€€ · 20–30€", "€€"], ["€€€ · 30–40€", "€€€"], ["€€€€ · 40–50€", "€€€€"], ["€€€€€ · 50–70€", "€€€€€"], ["€€€€€€ · over 70€", "€€€€€€"]];
  var KNOWN = CUISINE.concat(BARS).map(function (x) { return x[0]; }).concat(["Εστιατόρια για ψάρι & θαλασσινά", "Μεζεδοπωλεία & τσιπουράδικα", "Κλασικές Ταβέρνες", "Μοντέρνες Ταβέρνες", "Ταβέρνες για κρέας", "Eλληνική μοντέρνα κουζίνα", "Eλληνική παραδοσιακή κουζίνα", "Κλασική διεθνής κουζίνα", "Wine Bars/Restaurants", "Clubs & Bars", "Club restaurant", "Ethnic κουζίνες"]);

  var st = { kind: "Food", group: "", slug: "", page: 1, items: [], loading: false, done: false, err: "", token: 0, sel: { c: "", a: "", p: "" } };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function getText(url) {
    var cap = null;
    try { cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp; } catch (e) {}
    if (cap && cap.get) return cap.get({ url: url, headers: { "Accept": "text/html,*/*", "Accept-Language": "el,en;q=0.8" }, responseType: "text" }).then(function (r) {
      if (r && r.status && r.status >= 400) throw new Error("HTTP " + r.status);
      return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    });
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
  }
  function pageUrl() {
    var u = BASE + (st.slug ? "/" + (/^€+$/.test(st.slug) ? encodeURIComponent(st.slug) : st.slug) : "");
    return st.page > 1 ? u + "?page=" + st.page : u;
  }

  // text lines inside a card, in reading order
  function lines(node) {
    var out = [];
    (function walk(n) {
      if (n.nodeType === 3) { var t = n.nodeValue.replace(/\s+/g, " ").trim(); if (t) out.push(t); return; }
      if (n.nodeType !== 1 || /^(script|style|noscript|svg)$/i.test(n.tagName)) return;
      for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
    })(node);
    return out;
  }
  function parse(html) {
    var doc = new DOMParser().parseFromString(html, "text/html"), seen = {}, out = [];
    var as = doc.querySelectorAll('a[href*="/restaurants/place/"]');
    for (var i = 0; i < as.length; i++) {
      var a = as[i], href = (a.getAttribute("href") || "").split("#")[0], m = /\/restaurants\/place\/([^\/?]+?)-(\d+)\/?$/.exec(href);
      if (!m || seen[m[2]]) continue;
      var name = (a.textContent || "").replace(/\s+/g, " ").trim();
      if (!name) { var im = a.querySelector("img"); name = im ? (im.getAttribute("alt") || "").trim() : ""; }
      if (!name || name.length < 2) continue;
      // grow to the card that holds just this place
      var box = a;
      while (box.parentNode && box.parentNode.nodeType === 1 && box.parentNode.tagName !== "BODY") {
        var inner = box.parentNode.querySelectorAll('a[href*="/restaurants/place/"]'), ids = {}, n = 0;
        for (var k = 0; k < inner.length; k++) { var mm = /-(\d+)\/?(?:[?#].*)?$/.exec(inner[k].getAttribute("href") || ""); if (mm && !ids[mm[1]]) { ids[mm[1]] = 1; n++; } }
        if (n > 1) break; box = box.parentNode;
      }
      var ls = lines(box).filter(function (t) { return t !== name; }), price = "", cuisine = "", addr = "", phone = "";
      ls.forEach(function (t) {
        if (!price && /^€{1,6}$/.test(t)) { price = t; return; }
        if (!phone && /^τηλ/i.test(t)) { phone = t.replace(/^τηλ\.?:?\s*/i, ""); return; }
        if (!cuisine && KNOWN.indexOf(t) >= 0) { cuisine = t; return; }
      });
      if (!price) { var pm = /(€{1,6})/.exec(ls.join(" ")); if (pm) price = pm[1]; }
      // address: the first short line with a comma or a number that isn't the teaser
      for (var j = 0; j < ls.length; j++) { var t = ls[j]; if (t.length <= 70 && /[,\d]/.test(t) && !/^τηλ|^€/.test(t) && !/\.\.\.$|…$/.test(t) && KNOWN.indexOf(t) < 0) { addr = t; break; } }
      var area = addr.indexOf(",") >= 0 ? addr.slice(addr.lastIndexOf(",") + 1).trim() : "";
      var img = box.querySelector("img"), pic = "";
      if (img) ["data-src", "data-original", "src"].some(function (k2) { var v = img.getAttribute(k2); if (v && !/noimage|logo|placeholder|^data:/i.test(v)) { pic = v.indexOf("//") === 0 ? "https:" + v : v; return true; } return false; });
      seen[m[2]] = 1;
      out.push({ id: m[2], name: name, url: /^https?:/.test(href) ? href : "https://www.athinorama.gr" + href, cuisine: cuisine, addr: addr, area: area, price: price, phone: phone, pic: pic });
    }
    return out;
  }

  // ---- English, short names for areas and cuisines ----
  var GR = /[Ͱ-Ͽἀ-῿]/;
  function plain(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ς/g, "σ").replace(/[^a-zα-ω0-9]+/g, " ").trim(); }
  function translit(t) {
    var s = plain(t).replace(/^αγ /, "αγιοσ ").replace(/^πλ /, "πλατεια ").replace(/(^| )αια/g, "$1αια"), map = { α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o" }, o = "";
    for (var i = 0; i < s.length; i++) {
      var two = s.substr(i, 2), c = s[i], nx = s[i + 1] || "";
      if (two === "ου") { o += "ou"; i++; continue; } if (two === "αι") { o += "e"; i++; continue; } if (two === "ει" || two === "οι") { o += "i"; i++; continue; }
      if ((two === "αυ" || two === "ευ") ) { var after = s[i + 2] || ""; o += (c === "α" ? "a" : "e") + (/[βγδζλμνραεηιουω]/.test(after) || after === "" ? "v" : "f"); i++; continue; }
      if (two === "μπ") { o += (i === 0 || s[i - 1] === " ") ? "b" : "mp"; i++; continue; }
      if (two === "ντ") { o += (i === 0 || s[i - 1] === " ") ? "d" : "nt"; i++; continue; }
      if (c === "γ" && /[γκξχ]/.test(nx)) { o += "n"; continue; }
      o += map[c] !== undefined ? map[c] : c;
    }
    return o.replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); });
  }
  function enRegion(t) {
    t = String(t || "").trim(); if (!t) return "";
    if (/^αθηνα$/.test(plain(t))) return "Athens";
    var g = ""; try { g = (window.Openings && Openings.guessRegion(t)) || ""; } catch (e) {}
    if (g) return g;
    return GR.test(t) ? translit(t) : t;
  }
  var CU = { "ιταλικη": "Italian", "γιαπωνεζικη": "Japanese", "γαλλικη": "French", "κινεζικη": "Chinese", "ταιλανδεζικη": "Thai", "ινδικη πακιστανικη": "Indian", "μεξικανικη tex mex": "Mexican", "περουβιανη nikkei": "Peruvian",
    "πολιτικη κουζινα": "Politiki", "βιετναμεζικη": "Vietnamese", "multi ethnic": "International", "αιθιοπικη": "Ethiopian", "γερμανικη": "German", "εβραϊκη": "Jewish", "εβραικη": "Jewish", "περσικη": "Persian", "πολυασιατικες": "Asian",
    "ρωσικη": "Russian", "τσεχικη": "Czech", "φιλιππινεζικη": "Filipino", "ελληνικη μοντερνα": "Modern Greek", "ελληνικη μοντερνα κουζινα": "Modern Greek", "ελληνικη παραδοσιακη": "Greek", "ελληνικη παραδοσιακη κουζινα": "Greek",
    "ταβερνες μεζεδοπωλεια": "Taverna", "ταβερνες": "Taverna", "κλασικες ταβερνες": "Taverna", "μοντερνες ταβερνες": "Modern taverna", "ταβερνες για κρεας": "Taverna", "ψαροταβερνες": "Seafood", "μεζεδοπωλεια τσιπουραδικα": "Meze",
    "εστιατορια για ψαρι θαλασσινα": "Seafood", "ψαρι θαλασσινα": "Seafood", "εστιατορια για κρεας": "Steakhouse", "κρητικη κουζινα": "Cretan", "pizza": "Pizza", "burgers": "Burgers", "σουβλακι": "Souvlaki", "street food": "Street food",
    "vegetarian vegan": "Vegetarian", "all day food": "All-day", "bar restaurants": "Bar-restaurant", "wine bars restaurants": "Wine bar", "pastry shop": "Bakery", "μπιραριες": "Beer house", "μοντερνα κουζινα": "Modern", "κλασικη διεθνης κουζινα": "International",
    "club restaurant": "Club restaurant", "ethnic κουζινες": "Ethnic", "bars": "Bar", "clubs bars": "Bar", "κεμπαπ": "Kebab", "πεϊνιρλι": "Peinirli", "πειρνιρλι": "Peinirli", "εστιατορια": "" };
  function enCuisine(t) {
    t = String(t || "").trim(); if (!t) return "";
    var k = plain(t); if (CU.hasOwnProperty(k)) return CU[k];
    return GR.test(t) ? "" : t;
  }
  // one-time tidy of places imported earlier (only ones the guide added)
  function tidy(force) {
    try { if (!force && localStorage.getItem("guideTidy2") === "1") return 0; } catch (e) {}
    var all; try { all = JSON.parse(localStorage.getItem("entries")); } catch (e) {} if (!Array.isArray(all)) return 0;
    var n = 0;
    all.forEach(function (e) {
      if (!e.athId) return; var ch = false;
      if (e.region && (GR.test(e.region) || e.region === "Athens")) { var r = enRegion(e.region); if (r && r !== e.region) { e.region = r; ch = true; } }
      if (e.type === "Drinks" && e.drinkType && GR.test(e.drinkType)) { var d = enRegion(e.drinkType); if (d) { e.drinkType = d; ch = true; } }
      if (e.type === "Drinks" && e.region && e.drinkType !== e.region && e.athId) { e.drinkType = e.region; ch = true; }
      if (e.cuisineType) { var c = enCuisine(e.cuisineType); if (c !== e.cuisineType && (GR.test(e.cuisineType) || CU.hasOwnProperty(plain(e.cuisineType)))) { if (c) e.cuisineType = c; else delete e.cuisineType; ch = true; } }
      if (ch) n++;
    });
    if (n) { try { localStorage.setItem("entries", JSON.stringify(all)); entries = all; } catch (e) {} }
    try { localStorage.setItem("guideTidy2", "1"); } catch (e) {}
    return n;
  }

  function load(more) {
    var token = ++st.token;
    if (!more) { st.page = 1; st.items = []; st.done = false; }
    st.loading = true; st.err = ""; render();
    getText(pageUrl()).then(function (h) {
      if (token !== st.token) return;
      var list = parse(h), have = {};
      st.items.forEach(function (x) { have[x.id] = 1; });
      var fresh = list.filter(function (x) { return !have[x.id]; });
      st.items = st.items.concat(fresh); if (!fresh.length) st.done = true;
      st.loading = false; render(more);
    }).catch(function (e) {
      if (token !== st.token) return;
      st.loading = false; st.err = (e && e.message) || "no connection"; render(more);
    });
  }

  function opts(list, cur, label) {
    return '<option value="">' + label + '</option>' + list.map(function (x) { return '<option value="' + esc(x[1]) + '"' + (x[1] === cur ? " selected" : "") + '>' + esc(x[0]) + '</option>'; }).join("");
  }
  function rowHtml(x) {
    var meta = [x.cuisine, x.price].filter(Boolean).join(" · ");
    return '<div class="op-row" data-id="' + esc(x.id) + '"><div class="op-mid"><div class="op-t">' + esc(x.name) + '</div>' +
      (meta ? '<div class="op-snip">' + esc(meta) + '</div>' : "") + (x.addr ? '<div class="op-snip">' + esc(x.addr) + '</div>' : "") +
      '<div class="op-btns"><a class="op-open" target="_blank" rel="noopener" href="' + esc(x.url) + '">Read</a><button type="button" class="op-add" data-id="' + esc(x.id) + '">+ Add</button></div></div></div>';
  }
  function render(keep) {
    if (!$("gdSheet")) return;
    var food = st.kind === "Food", sel = st.sel;
    $("gdC").innerHTML = opts(food ? CUISINE : BARS, sel.c, food ? "Cuisine" : "Type");
    $("gdA").innerHTML = opts(AREA, sel.a, "Area");
    $("gdP").innerHTML = opts(PRICE, sel.p, "Price");
    var box = $("gdList"), top = box.scrollTop;
    var h = st.items.map(rowHtml).join("");
    if (st.loading && !st.items.length) h = '<p class="pick-empty">Loading the guide…</p>';
    else if (st.err && !st.items.length) h = '<p class="pick-empty">Couldn\'t read the guide (' + esc(st.err) + '). ' + (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() ? "Check your connection." : "This works inside the phone app; a browser blocks it.") + '</p><button class="btn btn-secondary w-100" id="gdRetry">Try again</button>';
    else if (!st.items.length) h = '<p class="pick-empty">No places found here.</p>';
    else if (st.loading) h += '<p class="pick-empty">Loading more…</p>';
    else if (st.err) h += '<p class="op-warn">Couldn\'t load more (' + esc(st.err) + ').</p><button class="btn btn-secondary w-100" id="gdMore">Try again</button>';
    else if (!st.done) h += '<button class="btn btn-secondary w-100 mt-2" id="gdMore">Load more</button>';
    box.innerHTML = h;
    if (keep) box.scrollTop = top;
    var r = $("gdRetry"); if (r) r.onclick = function () { load(false); };
    var mo = $("gdMore"); if (mo) mo.onclick = function () { st.page++; load(true); };
    box.querySelectorAll(".op-add").forEach(function (b) { b.onclick = function () { add(b.dataset.id); }; });
  }
  function pick(group, slug) {
    st.sel = { c: "", a: "", p: "" }; st.sel[group] = slug; st.slug = slug; st.group = group; load(false);
  }
  function add(id) {
    var x = st.items.filter(function (i) { return i.id === id; })[0]; if (!x) return;
    var region = enRegion(x.area || x.addr);
    if (!region) region = enRegion(st.group === "a" ? (AREA.filter(function (a) { return a[1] === st.slug; })[0] || [""])[0] : "");
    close();
    if (window.openEntryPrefilled) window.openEntryPrefilled(st.kind, x.name, region, { cuisine: st.kind === "Food" ? enCuisine(x.cuisine) : "", note: x.price ? "Price " + x.price : "" });
  }

  // ---- download the whole guide into a list ----
  var imp = { on: false, stop: false };
  function say(t) { var e = $("gdImpMsg"); if (e) e.textContent = t || ""; }
  function pageOf(slug, n) { var u = BASE + (slug ? "/" + slug : ""); return n > 1 ? u + "?page=" + n : u; }
  function crawl(slug, label) {
    var all = [], have = {}, n = 0, empty = 0;
    function next() {
      if (imp.stop || n >= 80) return Promise.resolve(all);
      n++; say(label + " · page " + n + " · " + all.length + " places…");
      return getText(pageOf(slug, n)).then(function (h) {
        var fresh = parse(h).filter(function (x) { return !have[x.id]; });
        fresh.forEach(function (x) { have[x.id] = 1; all.push(x); });
        empty = fresh.length ? 0 : empty + 1;
        if (empty >= 1) return all;
        return new Promise(function (r) { setTimeout(r, 250); }).then(next);
      }, function (e) { if (n === 1) throw e; return all; });
    }
    return next();
  }
  function importAll() {
    if (imp.on) { imp.stop = true; say("Stopping…"); return; }
    imp.on = true; imp.stop = false; $("gdImp").textContent = "Stop";
    var kind = st.kind, slugs = kind === "Drinks" ? [["bars", "Bars"], ["clubs_and_bars", "Clubs & Bars"]] : [["", "All restaurants"]];
    var chain = Promise.resolve([]);
    slugs.forEach(function (s) { chain = chain.then(function (acc) { return crawl(s[0], s[1]).then(function (l) { return acc.concat(l); }); }); });
    chain.then(function (items) {
      var seen = {}; items = items.filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; });
      if (!items.length) throw new Error("no places found");
      var all = []; try { all = JSON.parse(localStorage.getItem("entries")) || []; } catch (e) {}
      var have = {}, haveName = {};
      all.forEach(function (i) { if (i.athId) have[i.athId] = 1; if (i.placeName) haveName[String(i.placeName).toLowerCase().trim()] = 1; });
      var when = "2020-01-01T00:00:00.000Z", added = 0, skipped = 0;   // old date, so they don't crowd your "recent" row
      items.forEach(function (x) {
        if (have[x.id] || haveName[x.name.toLowerCase().trim()]) { skipped++; return; }
        var region = enRegion(x.area || x.addr);
        var e = { id: (crypto.randomUUID ? crypto.randomUUID() : "g" + x.id + Date.now()), athId: x.id, type: kind, placeName: x.name, checked: false, dateAdded: when, region: region };
        if (kind === "Drinks") e.drinkType = region; else if (enCuisine(x.cuisine)) e.cuisineType = enCuisine(x.cuisine);
        if (x.price) e.note = "Price " + x.price;
        if (x.addr) e.address = x.addr;
        all.push(e); added++;
      });
      localStorage.setItem("entries", JSON.stringify(all));
      try { entries = all; } catch (e) {}
      try { updateTileCounts(); } catch (e) {}
      try { if (currentCategory) showCategoryScreen(currentCategory); } catch (e) {}
      say((imp.stop ? "Stopped. " : "") + "Added " + added + " places to " + kind + (skipped ? " (" + skipped + " were already there)" : "") + ".");
      if (window.Share && Share.toast) Share.toast("Added " + added + " places to " + kind + " ✓");
    }).catch(function (e) { say("Couldn't download the guide (" + ((e && e.message) || "no connection") + ")."); })
      .then(function () { imp.on = false; imp.stop = false; var b = $("gdImp"); if (b) b.textContent = "Add the whole guide to my entries"; });
  }

  // ---- fill in cuisine + address for places already imported ----
  var upd = { on: false, stop: false };
  var GENERIC = /^(Εστιατόρια|Clubs? & Bars|Βινιέτες WEB)$/i;
  function parsePlace(html) {
    var doc = new DOMParser().parseFromString(html, "text/html"), ls = lines(doc.body), addr = "", cu = "";
    for (var i = 0; i < ls.length; i++) {
      var m = /^Διεύθυνση\s*:?\s*(.*)$/.exec(ls[i]);
      if (m) { addr = (m[1] || ls[i + 1] || "").trim(); break; }
    }
    var seen = {};
    ls.forEach(function (t) {
      if (cu || seen[t] || t.length > 60) return; seen[t] = 1;
      if (GENERIC.test(t)) return;
      if (KNOWN.indexOf(t) >= 0 || /^Εστιατόρια για|^Ταβέρνες|^Μεζεδοπωλεία|^Ψαροταβέρνες|^Κλασικές Ταβέρνες|^Μοντέρνες Ταβέρνες|^Κρητική/.test(t)) cu = t;
    });
    if (addr.length > 90 || /^(τηλ|τιμ)/i.test(addr)) addr = "";
    return { addr: addr, cuisine: cu };
  }
  function updateDetails() {
    if (upd.on) { upd.stop = true; say("Stopping…"); return; }
    var kind = st.kind, all = []; try { all = JSON.parse(localStorage.getItem("entries")) || []; } catch (e) {}
    var todo = all.filter(function (e) { return e.athId && e.type === kind && (!e.address || (kind === "Food" && !e.cuisineType)); });
    if (!todo.length) { say("Nothing to fill in — all imported places already have cuisine and address."); return; }
    upd.on = true; upd.stop = false; $("gdUpd").textContent = "Stop";
    var slugs = kind === "Drinks" ? [["bars", "Bars"], ["clubs_and_bars", "Clubs & Bars"]] : [["", "the guide"]];
    var chain = Promise.resolve([]);
    slugs.forEach(function (sl) { chain = chain.then(function (acc) { return crawl(sl[0], "Finding places in " + sl[1]).then(function (l) { return acc.concat(l); }); }); });
    chain.then(function (found) {
      var url = {}; found.forEach(function (x) { url[x.id] = x.url; });
      var idx = 0, done = 0, filled = 0, miss = 0, lastSave = 0;
      function save() { try { localStorage.setItem("entries", JSON.stringify(all)); entries = all; } catch (e) {} }
      function worker() {
        if (upd.stop || idx >= todo.length) return Promise.resolve();
        var e = todo[idx++], u = url[e.athId];
        if (!u) { miss++; done++; return worker(); }
        return getText(u).then(function (h) {
          var d = parsePlace(h), ch = false;
          if (d.addr && !e.address) { e.address = d.addr; ch = true; }
          if (kind === "Food" && enCuisine(d.cuisine) && !e.cuisineType) { e.cuisineType = enCuisine(d.cuisine); ch = true; }
          if (d.addr && (!e.region || e.region === "Athens" || e.region === "Αθήνα")) {
            var a = d.addr.indexOf(",") >= 0 ? d.addr.slice(d.addr.lastIndexOf(",") + 1).trim() : "", rg = "";
            rg = enRegion(a || d.addr);
            if (rg) { e.region = rg; if (kind === "Drinks") e.drinkType = e.region; ch = true; }
          }
          if (ch) filled++; else miss++;
        }, function () { miss++; }).then(function () {
          done++; say("Filling in details · " + done + " of " + todo.length + "…");
          if (done - lastSave >= 25) { lastSave = done; save(); }
          return new Promise(function (r) { setTimeout(r, 120); }).then(worker);
        });
      }
      return Promise.all([worker(), worker(), worker()]).then(function () {
        save(); try { updateTileCounts(); } catch (e) {} try { if (currentCategory) showCategoryScreen(currentCategory); } catch (e) {}
        say((upd.stop ? "Stopped. " : "") + "Updated " + filled + " places" + (miss ? " (" + miss + " had nothing new to add)" : "") + ".");
      });
    }).catch(function (e) { say("Couldn't update (" + ((e && e.message) || "no connection") + ")."); })
      .then(function () { upd.on = false; upd.stop = false; var b = $("gdUpd"); if (b) b.textContent = "Fill in cuisine & address"; });
  }

  function ensure() {
    if ($("gdSheet")) return;
    var d = document.createElement("div");
    d.innerHTML = '<div class="op-ov" id="gdOv"></div><div class="op-sheet" id="gdSheet" role="dialog" aria-label="Athinorama guide">' +
      '<div class="op-grab"></div><div class="op-h">Athinorama guide</div><div class="op-src">Pick one filter: cuisine, area or price</div>' +
      '<div class="gd-filters"><select id="gdC" class="form-select filter-pill"></select><select id="gdA" class="form-select filter-pill"></select><select id="gdP" class="form-select filter-pill"></select></div>' +
      '<div class="op-list" id="gdList"></div><div class="op-foot"><div class="op-warn" id="gdImpMsg"></div><button type="button" class="btn btn-secondary mb-2" id="gdUpd">Fill in cuisine & address</button><button type="button" class="btn btn-secondary mb-2" id="gdImp">Add the whole guide to my entries</button><button type="button" class="btn btn-light" id="gdClose">Close</button></div></div>';
    document.body.appendChild(d);
    $("gdOv").onclick = close; $("gdClose").onclick = close; $("gdImp").onclick = importAll; $("gdUpd").onclick = updateDetails;
    $("gdC").onchange = function () { pick("c", this.value); };
    $("gdA").onchange = function () { pick("a", this.value); };
    $("gdP").onchange = function () { pick("p", this.value); };
  }
  function open(kind) {
    st.kind = kind === "Drinks" ? "Drinks" : "Food"; ensure();
    st.sel = { c: "", a: "", p: "" }; st.slug = ""; st.group = "";
    if (st.kind === "Drinks") { st.sel.c = "bars"; st.slug = "bars"; st.group = "c"; }
    say("");
    $("gdOv").classList.add("show"); $("gdSheet").classList.add("show");
    load(false);
  }
  function close() { if ($("gdOv")) { $("gdOv").classList.remove("show"); $("gdSheet").classList.remove("show"); } }

  window.Guide = { tidy: tidy, enRegion: enRegion, enCuisine: enCuisine, open: open, close: close, parse: parse, importAll: importAll, updateDetails: updateDetails, parsePlace: parsePlace, _state: st };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(function () { if (tidy()) try { if (currentCategory) showCategoryScreen(currentCategory); } catch (e) {} }, 400); }); else setTimeout(function () { tidy(); }, 400);
})();
