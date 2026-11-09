/* Little chip on the home screen, next to the title: a "Did you know?" fact or a "Remember?" nudge from your own places.
   Tap it to open the card; × hides it for today. */
(function () {
  "use strict";
  var FACTS = [
    "Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid of Giza.",
    "Oxford University is older than the Aztec Empire. Teaching began there around 1096; Tenochtitlan was founded in 1325.",
    "Honey almost never spoils. Edible honey has been found in ancient Egyptian tombs.",
    "Octopuses have three hearts.",
    "Botanically, bananas are berries but strawberries are not.",
    "A day on Venus is longer than its year.",
    "The Eiffel Tower can grow about 15 cm taller in hot summer weather.",
    "Wombats produce cube-shaped droppings.",
    "Scotland's national animal is the unicorn.",
    "The Anglo-Zanzibar War of 1896 is the shortest war on record. It lasted roughly 40 minutes.",
    "Greece has around 6,000 islands and islets, but only about 200 of them are inhabited.",
    "The marathon is named after the Battle of Marathon, about 40 km from Athens. The first modern marathon ran at the 1896 Athens Olympics.",
    "The first modern Olympic Games were held in Athens in 1896.",
    "Athens has been inhabited continuously for more than 3,000 years.",
    "Some Athens metro stations double as museums, with ancient finds from the metro excavations on display.",
    "The Parthenon was finished in 432 BC.",
    "Mount Olympus, the highest mountain in Greece, is about 2,900 metres tall.",
    "Sharks are older than trees. Sharks appeared more than 400 million years ago.",
    "A group of flamingos is called a flamboyance.",
    "Sound travels about four times faster in water than in air.",
    "A lightning bolt is about five times hotter than the surface of the Sun.",
    "Venus is hotter than Mercury, even though Mercury is closer to the Sun.",
    "There are more possible games of chess than atoms in the observable universe.",
    "Antarctica is the largest desert on Earth.",
    "Cats have a third eyelid.",
    "Coffee beans are the seeds of a fruit called the coffee cherry.",
    "Tomatoes were once feared as poisonous in parts of Europe.",
    "The word \"tsunami\" is Japanese for \"harbour wave\".",
    "The word \"alphabet\" comes from the first two Greek letters, alpha and beta.",
    "The word \"cinema\" comes from the Greek \"kinema\", meaning movement.",
    "\"Gastronomy\" is a Greek word: gaster (stomach) plus nomos (law).",
    "\"Symposium\" originally meant \"drinking together\" in ancient Greece.",
    "\"Nostalgia\" comes from Greek: nostos (return home) and algos (pain).",
    "\"Quarantine\" comes from the Italian for \"forty days\".",
    "\"Robot\" comes from the Czech word \"robota\", meaning forced labour.",
    "The Lumière brothers held the first paid public film screening in Paris on 28 December 1895.",
    "Sunlight takes about 8 minutes and 20 seconds to reach Earth.",
    "A year on Mercury lasts only 88 Earth days.",
    "Jupiter's Great Red Spot is a storm larger than Earth.",
    "There are more trees on Earth than stars in the Milky Way.",
    "Your skeleton is renewed roughly every ten years.",
    "The Netherlands has more bicycles than people.",
    "Vatican City is the smallest country in the world.",
    "Russia spans eleven time zones.",
    "Australia is wider than the Moon.",
    "The Dead Sea shore is the lowest land point on Earth, about 430 metres below sea level.",
    "Japan is made up of more than 6,800 islands.",
    "Venice is built across roughly 118 small islands.",
    "The Colosseum in Rome could hold about 50,000 spectators.",
    "Beethoven kept composing while almost completely deaf.",
    "Mozart began composing at the age of five.",
    "Early cultivated carrots were purple and yellow, not orange.",
    "Peanuts are not nuts. They are legumes.",
    "Apples float because about a quarter of their volume is air.",
    "The Maya and Aztecs first drank chocolate as a bitter beverage.",
    "A pineapple takes about two years to grow.",
    "Saffron is the most expensive spice by weight.",
    "Under EU rules, only cheese made in Greece from sheep's milk, or sheep's and goat's milk, can be called feta.",
    "Greeks are among the biggest olive oil consumers per person in the world.",
    "Basketball was invented in 1891 by James Naismith.",
    "The first webcam was pointed at a coffee pot at the University of Cambridge, so researchers could see if it was empty.",
    "The first computer mouse was made of wood.",
    "Footprints on the Moon could last for millions of years, because there is no wind to erase them.",
    "A teaspoon of neutron-star material would weigh billions of tonnes.",
    "Sea otters hold hands while they sleep so they don't drift apart.",
    "Crows can recognise individual human faces.",
    "Dolphins call each other with signature whistles that work like names.",
    "A group of crows is called a murder.",
    "Butterflies taste with their feet.",
    "Koalas have fingerprints that are very similar to human ones.",
    "Hummingbirds can fly backwards.",
    "Some penguins offer a pebble to a mate as a gift.",
    "Napoleon was of about average height for his time, not unusually short.",
    "Vikings are not known to have worn horned helmets in battle.",
    "The Santorini caldera was shaped by a huge volcanic eruption about 3,600 years ago.",
    "Athens hosted the 2004 Summer Olympics.",
    "The Acropolis Museum has glass floors that let visitors look down onto an excavated ancient neighbourhood.",
    "The first commercially produced CD was ABBA's \"The Visitors\" in 1982.",
    "\"Philosophy\" means \"love of wisdom\" in Greek."
  ];

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function dayNum() { return Math.floor(new Date().setHours(0, 0, 0, 0) / 864e5); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return n >>> 0; }

  var st = { open: false, i: 0 };
  function entries() { try { return JSON.parse(localStorage.getItem("entries")) || []; } catch (e) { return []; } }
  function ago(iso) {
    var t = new Date(iso).getTime(); if (!t) return ""; var d = Math.floor((Date.now() - t) / 864e5);
    if (d < 14) return ""; if (d < 60) return "saved " + Math.round(d / 7) + " weeks ago"; if (d < 700) return "saved " + Math.round(d / 30) + " months ago"; return "";
  }
  function pools() {
    var own = [], guide = [];
    entries().forEach(function (e) { if ((e.type === "Food" || e.type === "Drinks") && !e.checked && e.placeName) (e.athId ? guide : own).push(e); });
    return { own: own, guide: guide };
  }
  // what to show for step i: even = a fact, odd = a place to remember (when there is one)
  function item(i) {
    var p = pools();
    if (i % 2 === 1 && (p.own.length || p.guide.length)) {
      var useOwn = p.own.length && (!p.guide.length || hash(i + 7) % 2 === 0), list = useOwn ? p.own : p.guide;
      var e = list[hash(i * 31 + dayNum()) % list.length];
      var sub = [e.type === "Drinks" ? e.drinkType : e.cuisineType, e.type === "Food" ? e.region : ""].filter(Boolean).join(" · ");
      var when = ago(e.dateAdded);
      return { kind: "mem", ico: e.type === "Drinks" ? "🍸" : "🍽", k: "Remember?", short: e.placeName + " · " + (when || "not visited yet"),
        big: e.placeName + (sub ? " · " + sub : "") + ". " + (when ? "You " + when + " and " : "You ") + "haven't been yet.", id: e.id };
    }
    var f = FACTS[hash(Math.floor(i / 2) * 17 + dayNum() * 3) % FACTS.length];
    return { kind: "fact", ico: "💡", k: "Did you know?", short: f, big: f };
  }
  function start() {
    if (ls("funDay") !== today()) { ls("funDay", today()); ls("funI", String(hash(dayNum()) % 1000)); ls("funOpen", null); }
    st.i = parseInt(ls("funI"), 10) || 0;
  }
  // pop-up shown when the app opens (once per launch); tap "What's New?" to see it again
  function removePop() { var o = $("funPop"); if (o) o.remove(); }
  function close() { removePop(); st.open = false; }
  function render() {
    removePop(); if (!st.open) return;
    var it = item(st.i), o = document.createElement("div"); o.id = "funPop"; o.className = "fn-ov";
    o.innerHTML = '<div class="fn-pop" role="dialog" aria-label="' + esc(it.k) + '"><button type="button" class="fn-x" id="funX" aria-label="Close">×</button>' +
      '<div class="fn-k">' + it.ico + ' ' + esc(it.k) + '</div><p>' + esc(it.big) + '</p>' +
      '<div class="fn-b">' + (it.id ? '<button type="button" class="go" id="funGo">Open</button>' : "") + '<button type="button" id="funNext">' + (it.kind === "fact" ? "Another one" : "Another") + '</button></div>' +
      '<button type="button" class="fn-not" id="funNot">Not today</button></div>';
    document.body.appendChild(o);
    o.onclick = function (e) { if (e.target === o) close(); };
    $("funX").onclick = close;
    $("funNot").onclick = function () { ls("funHidden", today()); close(); };
    var g = $("funGo"); if (g) g.onclick = function () { close(); if (window.PhotoUI) PhotoUI.openEntry(it.id); };
    $("funNext").onclick = function () { st.i++; ls("funI", String(st.i)); st.open = true; render(); };
  }
  function show() { st.open = true; render(); }
  function init() {
    start();
    var box = $("funBox"); if (box) box.innerHTML = ""; var cd = $("funCard"); if (cd) cd.innerHTML = "";
    var h = document.querySelector("#homeScreen .screen-title");
    if (h && !h.dataset.fun) { h.dataset.fun = "1"; h.style.cursor = "pointer"; h.addEventListener("click", show); }
    var seen = false; try { seen = sessionStorage.getItem("funShown") === "1"; } catch (e) {}
    if (!seen && ls("funHidden") !== today()) { try { sessionStorage.setItem("funShown", "1"); } catch (e) {} setTimeout(show, 700); }
  }
  window.Fun = { init: init, show: show, close: close, render: render, _facts: FACTS, _item: item, _state: st };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
