/* Android back gesture / back button: closes the top pop-up, sheet or screen instead of leaving the app.
   Works without extra plugins: each open layer adds a browser-history step, and Android's back goes back one step. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function shown(el) { return !!el && el.style.display !== "none" && getComputedStyle(el).display !== "none"; }
  function cls(id) { var el = $(id); return !!el && (el.classList.contains("show") || el.classList.contains("active")); }
  function call(name) { var f = window[name]; if (typeof f === "function") f(); }

  // top-most first
  var LAYERS = [
    { open: function () { return !!$("funPop"); }, close: function () { window.Fun && Fun.close(); } },
    { open: function () { return shown($("customModal")); }, close: function () { call("closeCustomModal"); } },
    { open: function () { var b = $("pvClose"); return !!(b && b.closest(".show")); }, close: function () { $("pvClose").click(); } },
    { open: function () { var w = $("alarmWrap"); return !!(w && w.querySelector(".al-sheet")); }, close: function () { call("alarmClose"); } },
    { open: function () { return cls("bkSheet"); }, close: function () { call("bulkClose"); } },
    { open: function () { return cls("lsSheet"); }, close: function () { window.ListSheet && ListSheet.close(); } },
    { open: function () { return cls("esSheet"); }, close: function () { window.PhotoUI && PhotoUI.closeEntry(); } },
    { open: function () { return cls("gdSheet"); }, close: function () { window.Guide && Guide.close(); } },
    { open: function () { return cls("opSheet"); }, close: function () { window.Openings && Openings.close(); } },
    { open: function () { return cls("pickSheet"); }, close: function () { call("closePicker"); } },
    { open: function () { return cls("tonightSheet"); }, close: function () { call("closeTonight"); } },
    { open: function () { return cls("addToListPanel"); }, close: function () { call("closeAddToListPanel"); } },
    { open: function () { return cls("createListPanel"); }, close: function () { call("closeCreateListPanel"); } },
    { open: function () { return cls("addEntryPanel"); }, close: function () { call("closeAddEntryPanel"); } },
    { open: function () { return cls("listsPanel"); }, close: function () { call("closeListsPanel"); } },
    { open: function () { var a = $("alarmPanel"); return !!a && a.style.display !== "none" && shown(a); }, close: function () { call("closeAlarmPanel"); } },
    { open: function () { return cls("toolsPanel"); }, close: function () { call("toggleToolsPanel"); } },
    { open: function () { return cls("mpScreen"); }, close: function () { window.MapView && MapView.close(); } },
    { open: function () { return shown($("containerScreen")); }, close: function () { call("closeContainerScreen"); } },
    { open: function () { return shown($("categoryScreen")); }, close: function () { call("showHome"); window.scrollTo(0, 0); } }
  ];
  function openCount() { var n = 0; LAYERS.forEach(function (l) { try { if (l.open()) n++; } catch (e) {} }); return n; }
  function closeTop() { for (var i = 0; i < LAYERS.length; i++) { try { if (LAYERS[i].open()) { LAYERS[i].close(); return true; } } catch (e) {} } return false; }

  var depth = 0, ignore = 0, raf = 0;
  function sync() {
    raf = 0;
    var n = openCount();
    if (n > depth) { while (depth < n) { history.pushState({ backLayer: depth + 1 }, ""); depth++; } }
    else if (n < depth) { ignore++; var k = depth - n; depth = n; history.go(-k); }   // closed by a button: drop the extra steps
  }
  function schedule() { if (!raf) raf = (window.requestAnimationFrame || setTimeout)(sync); }
  window.addEventListener("popstate", function () {
    if (ignore > 0) { ignore--; return; }
    depth = Math.max(0, depth - 1);
    closeTop();
    setTimeout(function () { var n = openCount(); if (n > depth) { while (depth < n) { history.pushState({ backLayer: depth + 1 }, ""); depth++; } } }, 60);
  });
  function start() {
    if (!window.MutationObserver) return;
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    schedule();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.BackNav = { _count: openCount, _depth: function () { return depth; } };
})();

/* Phone back button (Android). Android's WebView does not count the history steps made by pushState,
   so the native back button would leave the app. The App plugin hands the press to us instead. */
(function () {
  "use strict";
  var tries = 0;
  function hook() {
    var App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App || !App.addListener) { if (++tries < 40) setTimeout(hook, 250); return; }
    App.addListener("backButton", function () {
      var d = window.BackNav && BackNav._depth ? BackNav._depth() : 0;
      if (d > 0) history.back();          // close the top pop-up, sheet, map or screen
      else App.exitApp();                 // nothing open: leave the app, as expected on Home
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook); else hook();
})();
