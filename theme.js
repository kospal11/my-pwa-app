// Theme + accent colour. Load this in <head> (before the page paints) on every page.
(function () {
  var ACCENTS = {
    amber:  { name: "Amber",  a: "#FFA62B", b: "#FFBF69", ink: "#1A1206", glow: "rgba(255,166,43,0.55)" },
    blue:   { name: "Blue",   a: "#4C8DFF", b: "#8DB5FF", ink: "#06122B", glow: "rgba(76,141,255,0.55)" },
    green:  { name: "Green",  a: "#2FBF71", b: "#6FD9A0", ink: "#04180D", glow: "rgba(47,191,113,0.55)" },
    pink:   { name: "Pink",   a: "#FF5C8A", b: "#FF8FAF", ink: "#2B0613", glow: "rgba(255,92,138,0.55)" },
    purple: { name: "Purple", a: "#9B7BFF", b: "#BFA9FF", ink: "#120A2B", glow: "rgba(155,123,255,0.55)" }
  };

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function currentMode() {
    var m = read("themeMode");
    return m === "light" || m === "dark" ? m : "dark";
  }
  function currentAccent() {
    var a = read("themeAccent");
    return ACCENTS[a] ? a : "amber";
  }

  function apply() {
    var mode = currentMode();
    var acc = ACCENTS[currentAccent()];
    var root = document.documentElement;
    root.setAttribute("data-theme", mode);
    root.setAttribute("data-bs-theme", mode);
    root.style.setProperty("--accent", acc.a);
    root.style.setProperty("--accent-2", acc.b);
    root.style.setProperty("--ink", acc.ink);
    root.style.setProperty("--accent-glow", acc.glow);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "light" ? "#F6F4EF" : "#0F1013");
  }

  function renderPicker(el) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return;
    var mode = currentMode(), accent = currentAccent();
    el.innerHTML = "";

    var label1 = document.createElement("div");
    label1.className = "theme-label"; label1.textContent = "Theme";
    var modeRow = document.createElement("div");
    modeRow.className = "theme-row";
    [["dark", "Dark"], ["light", "Light"]].forEach(function (m) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (mode === m[0] ? " is-active" : "");
      b.textContent = m[1];
      b.onclick = function () { window.Theme.setMode(m[0]); renderPicker(el); };
      modeRow.appendChild(b);
    });

    var label2 = document.createElement("div");
    label2.className = "theme-label"; label2.textContent = "Accent colour";
    var accRow = document.createElement("div");
    accRow.className = "theme-row";
    Object.keys(ACCENTS).forEach(function (key) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (accent === key ? " is-active" : "");
      b.style.background = ACCENTS[key].a;
      b.setAttribute("aria-label", ACCENTS[key].name);
      b.onclick = function () { window.Theme.setAccent(key); renderPicker(el); };
      accRow.appendChild(b);
    });

    el.appendChild(label1); el.appendChild(modeRow);
    el.appendChild(label2); el.appendChild(accRow);
  }

  window.Theme = {
    accents: ACCENTS,
    setMode: function (m) { write("themeMode", m); apply(); },
    setAccent: function (a) { write("themeAccent", a); apply(); },
    renderPicker: renderPicker
  };

  apply();
  document.addEventListener("DOMContentLoaded", apply);
})();
