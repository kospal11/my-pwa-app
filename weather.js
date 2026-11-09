/* Tonight's weather + one suggestion from your own places. Data: Open-Meteo (free, no key). */
(function () {
  "use strict";
  var LAT = 37.98, LON = 23.73;   // Athens
  var ROOF = /rooftop|roof top|terrace|garden|outdoor|βεράντα|ταράτσα|ταρατσα|κήπος|θέα|\bview\b/i;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getJson(url) {
    var cap = null; try { cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp; } catch (e) {}
    if (cap && cap.get) return cap.get({ url: url }).then(function (r) { return typeof r.data === "string" ? JSON.parse(r.data) : r.data; });
    return fetch(url).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function fetchWeather() {
    var key = "weather.cache";
    try { var c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.t < 30 * 60e3) return Promise.resolve(c.d); } catch (e) {}
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
      "&current=temperature_2m,apparent_temperature,weather_code&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code&daily=sunset&timezone=auto&forecast_days=1";
    return getJson(url).then(function (j) {
      var now = new Date(), h = now.getHours(), pick = h >= 20 ? h : 20, H = j.hourly || {}, times = H.time || [];
      function at(arr, hr) { var i = times.findIndex(function (t) { return new Date(t).getHours() === hr; }); return i >= 0 && arr ? arr[i] : null; }
      var useNow = h >= 20 && j.current;
      var temp = useNow ? j.current.temperature_2m : at(H.temperature_2m, pick);
      var feels = useNow ? j.current.apparent_temperature : at(H.apparent_temperature, pick);
      var code = useNow ? j.current.weather_code : at(H.weather_code, pick);
      var prob = 0; (H.precipitation_probability || []).forEach(function (p, i) { var hh = new Date(times[i]).getHours(); if (hh >= 18 && hh <= 23 && p > prob) prob = p; });
      var sun = j.daily && j.daily.sunset && j.daily.sunset[0] ? String(j.daily.sunset[0]).slice(11, 16) : "";
      if (temp == null) throw new Error("no data");
      var d = { temp: Math.round(temp), feels: feels == null ? null : Math.round(feels), code: code == null ? 0 : code, prob: prob, sunset: sun };
      try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
      return d;
    });
  }
  function kindOf(c) {
    if (c >= 95) return "storm"; if (c >= 71 && c <= 77) return "snow"; if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
    if (c === 45 || c === 48) return "fog"; if (c === 3) return "cloud"; if (c === 2) return "partly"; return "clear";
  }
  var ICON = { storm: "⛈", snow: "❄️", rain: "🌧", fog: "🌫", cloud: "☁️", partly: "⛅", clear: "☀️" };
  var WORD = { storm: "stormy", snow: "snowy", rain: "rainy", fog: "foggy", cloud: "cloudy", partly: "partly cloudy", clear: "clear" };

  function places() { try { return (JSON.parse(localStorage.getItem("entries")) || []).filter(function (e) { return e.type === "Food" || e.type === "Drinks"; }); } catch (e) { return []; } }
  function roofPlaces() {
    var l = places().filter(function (e) { return ROOF.test([e.placeName, e.cuisineType, e.note].join(" ")); });
    l.sort(function (a, b) { return (a.checked ? 1 : 0) - (b.checked ? 1 : 0); });
    return l;
  }
  function planned() { try { return (JSON.parse(localStorage.getItem("entries")) || []).filter(function (e) { return e.type === "Cinema" && !e.checked; }).length; } catch (e) { return 0; } }

  function idea(w) {
    var k = kindOf(w.code), wet = w.prob >= 50 || k === "rain" || k === "storm" || k === "snow";
    if (wet) { var n = planned(); return { icon: "🌧", t: "Rainy tonight · cinema weather", s: n ? n + " film" + (n === 1 ? "" : "s") + " waiting on your list" : "Find something to watch", btn: "Pick", act: function () { window.openTonight && openTonight("Cinema"); } }; }
    if (w.temp < 12) return { icon: "🍲", t: "Chilly tonight · a cosy dinner", s: "Pick something warm from your places", btn: "Pick", act: function () { window.openTonight && openTonight("Food"); } };
    if (w.temp >= 17) {
      var r = roofPlaces();
      if (r.length) return { icon: "🍸", t: "Good night for a rooftop", s: r.length + " of your places · e.g. " + (r[0].placeName || ""), btn: "Show", act: function () { showRoofs(r); } };
      return { icon: "🍸", t: "Warm, dry night · a drink out?", s: "No rooftop places saved yet", btn: "Pick", act: function () { window.openTonight && openTonight("Drinks"); } };
    }
    return { icon: "🍽", t: "Mild evening · good for dinner out", s: "Let the app choose a place", btn: "Pick", act: function () { window.openTonight && openTonight("Food"); } };
  }

  function showRoofs(list) {
    var w = $("alarmWrap"); if (!w) { w = document.createElement("div"); w.id = "alarmWrap"; document.body.appendChild(w); }
    w.innerHTML = '<div class="al-ov" onclick="alarmClose()"></div><div class="al-sheet" role="dialog" aria-label="Rooftops"><div class="al-h">🍸 Rooftop & outdoor places</div><div class="wx-list">' +
      list.slice(0, 15).map(function (e) { return '<button type="button" class="wx-row" data-id="' + esc(e.id) + '"><span>' + esc(e.placeName) + '</span><small>' + esc([e.type === "Drinks" ? e.drinkType : e.region, e.checked ? "been" : "not yet"].filter(Boolean).join(" · ")) + '</small></button>'; }).join("") +
      '</div><button type="button" class="btn btn-link w-100" onclick="alarmClose()">Close</button></div>';
    w.querySelectorAll(".wx-row").forEach(function (b) { b.onclick = function () { var id = b.dataset.id; if (window.alarmClose) alarmClose(); if (window.PhotoUI) PhotoUI.openEntry(id); }; });
  }

  function collapsed() { try { return localStorage.getItem("weatherCollapsed") === "1"; } catch (e) { return false; } }
  function setCollapsed(v) { try { localStorage.setItem("weatherCollapsed", v ? "1" : "0"); } catch (e) {} render(); }
  var W = null;
  function render() {
    var box = $("weatherBox"); if (!box) return;
    if (!W) { box.style.display = "none"; return; }
    var k = kindOf(W.code), i = idea(W), col = collapsed();
    box.style.display = "";
    box.innerHTML = '<div class="w-strip"><span class="w-chip">' + ICON[k] + ' <b>' + W.temp + '°</b> ' + (W.prob >= 50 ? "rain likely" : WORD[k]) + '</span>' +
      (W.sunset ? '<span class="w-chip">🌇 Sunset <b>' + esc(W.sunset) + '</b></span>' : "") +
      (W.feels != null && Math.abs(W.feels - W.temp) >= 2 ? '<span class="w-chip">🌡 feels ' + W.feels + '°</span>' : "") + '</div>' +
      (col ? '<button type="button" class="w-mini" id="wxOpen">Tonight\'s idea <span>▾</span></button>' :
        '<div class="w-line"><span class="big">' + i.icon + '</span><div class="w-txt"><div class="t">' + esc(i.t) + '</div><div class="s">' + esc(i.s) + '</div></div>' +
        '<button type="button" class="w-go" id="wxGo">' + esc(i.btn) + '</button><button type="button" class="w-x" id="wxHide" aria-label="Collapse">▴</button></div>');
    var go = $("wxGo"); if (go) go.onclick = i.act;
    var h = $("wxHide"); if (h) h.onclick = function () { setCollapsed(true); };
    var o = $("wxOpen"); if (o) o.onclick = function () { setCollapsed(false); };
  }
  function init() {
    fetchWeather().then(function (d) { W = d; render(); }).catch(function () { W = null; render(); });
  }
  window.Weather = { init: init, render: render, _idea: idea, _kind: kindOf, _set: function (d) { W = d; render(); } };
  document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 600); });
})();
