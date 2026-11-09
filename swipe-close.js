// Drag a bottom sheet down to close it (More, Add entry, Tonight, photos, ...). Works from the top strip of the sheet,
// or from anywhere on it when its content is scrolled to the top.
(function () {
  var CLOSERS = {
    toolsPanel: function () { return window.toggleToolsPanel && toggleToolsPanel(); },
    addEntryPanel: function () { return window.closeAddEntryPanel && closeAddEntryPanel(); },
    createListPanel: function () { return window.closeCreateListPanel && closeCreateListPanel(); },
    addToListPanel: function () { return window.closeAddToListPanel && closeAddToListPanel(); },
    listsPanel: function () { return window.closeListsPanel && closeListsPanel(); },
    tonightSheet: function () { return window.closeTonight && closeTonight(); },
    pickSheet: function () { return window.closePicker && closePicker(); },
    esSheet: function () { return window.PhotoUI && PhotoUI.closeEntry(); },
    bkSheet: function () { return window.bulkClose && bulkClose(); },
    gdSheet: function () { return window.Guide && Guide.close(); },
    lsSheet: function () { return window.ListSheet && ListSheet.close(); },
    opSheet: function () { return window.Openings && Openings.close(); },
    alarmPanel: function () { return window.closeAlarmPanel && closeAlarmPanel(); }
  };
  function isOpen(el) {
    if (el.classList.contains("al-sheet")) return true;
    if (el.id === "alarmPanel") return el.style.display !== "none";
    return el.classList.contains("active") || el.classList.contains("show");
  }
  function sheetOf(t) {
    while (t && t !== document.body) { if ((t.id && CLOSERS[t.id]) || (t.classList && t.classList.contains("al-sheet"))) return t; t = t.parentNode; }
    return null;
  }
  var st = null;
  function scrolledInside(t, sheet) {
    while (t && t !== sheet.parentNode) {
      if (t.scrollHeight > t.clientHeight + 1 && t.scrollTop > 0 && /auto|scroll/.test(getComputedStyle(t).overflowY)) return true;
      t = t.parentNode;
    }
    return false;
  }
  document.addEventListener("touchstart", function (e) {
    st = null;
    if (e.touches.length !== 1) return;
    var sh = sheetOf(e.target); if (!sh || !isOpen(sh)) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || tag === "canvas") return;
    var r = sh.getBoundingClientRect(), y = e.touches[0].clientY;
    st = { sh: sh, x: e.touches[0].clientX, y: y, t: Date.now(), top: y - r.top < 90, ok: !scrolledInside(e.target, sh), on: false, dy: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (!st || !st.ok) return;
    var dy = e.touches[0].clientY - st.y, dx = e.touches[0].clientX - st.x;
    if (!st.on) {
      if (dy > 10 && dy > Math.abs(dx) * 1.5 && (st.top || (st.sh.scrollTop || 0) <= 0)) { st.on = true; st.sh.style.transition = "none"; }
      else if (Math.abs(dx) > 14 || dy < -10) { st = null; return; }
      else return;
    }
    st.dy = Math.max(0, dy);
    st.sh.style.transform = "translateY(" + st.dy + "px)";
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  function finish() {
    if (!st) return; var s = st; st = null;
    if (!s.on) return;
    var fast = s.dy / Math.max(1, Date.now() - s.t) > 0.6;
    var sh = s.sh;
    if (s.dy > 110 || (fast && s.dy > 40)) {
      sh.style.transition = "transform 0.18s ease"; sh.style.transform = "translateY(110%)";
      setTimeout(function () {
        sh.style.transition = "none";
        try { if (sh.classList.contains("al-sheet")) { window.alarmClose && alarmClose(); } else CLOSERS[sh.id](); } catch (x) {}
        sh.style.transform = "";
        setTimeout(function () { sh.style.transition = ""; }, 60);
      }, 190);
    } else {
      sh.style.transition = "transform 0.18s ease"; sh.style.transform = "";
      setTimeout(function () { sh.style.transition = ""; }, 200);
    }
  }
  document.addEventListener("touchend", finish, { passive: true });
  document.addEventListener("touchcancel", finish, { passive: true });
})();
