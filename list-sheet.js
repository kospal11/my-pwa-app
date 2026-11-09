/* A saved list (Other → List): a bottom sheet with tick boxes, add/remove items, clear done, delete. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var curId = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function all() { try { return JSON.parse(localStorage.getItem("entries")) || []; } catch (e) { return []; } }
  function put(list) { try { localStorage.setItem("entries", JSON.stringify(list)); } catch (e) {} }
  function find(list) { for (var i = 0; i < list.length; i++) if (list[i].id === curId) return list[i]; return null; }
  // items: new shape {t, done}; older saves kept them as "• line" text in note
  function itemsOf(e) {
    if (Array.isArray(e.items)) return e.items;
    return String(e.note || "").split("\n").filter(Boolean).map(function (l) { return { t: l.replace(/^•\s*/, ""), done: false }; });
  }
  function render() {
    var e = find(all()); if (!e) { close(); return; }
    var items = itemsOf(e), done = items.filter(function (i) { return i.done; }).length;
    $("lsTitle").textContent = e.otherName || "List";
    $("lsSub").textContent = items.length ? done + " of " + items.length + " done" : "Empty. Add your first item below.";
    $("lsItems").innerHTML = items.map(function (it, i) {
      return '<li class="' + (it.done ? "done" : "") + '">' +
        '<button type="button" class="ls-box" data-i="' + i + '" aria-label="Tick ' + esc(it.t) + '" aria-pressed="' + (it.done ? "true" : "false") + '"><span class="ls-dot"></span></button>' +
        '<span class="ls-t">' + esc(it.t) + '</span>' +
        '<button type="button" class="ls-del" data-d="' + i + '" aria-label="Remove ' + esc(it.t) + '">×</button></li>';
    }).join("");
    $("lsClear").disabled = !done;
    $("lsClear").style.opacity = done ? "1" : ".4";
  }
  function mutate(fn) {
    var list = all(), e = find(list); if (!e) return;
    var items = itemsOf(e).slice();
    fn(items);
    e.items = items; delete e.note;   // the list lives in items from now on
    put(list); render();
  }
  function addFromBox() {
    var box = $("lsNew"), lines = String(box.value || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) return;
    mutate(function (items) { lines.forEach(function (t) { items.push({ t: t, done: false }); }); });
    box.value = ""; box.focus();
  }
  var delArm = null;
  function open(id) {
    curId = id;
    var e = find(all()); if (!e) return;
    delArm = null; $("lsDel").textContent = "Delete list";
    $("lsNew").value = "";
    render();
    $("lsSheet").classList.add("show");
    setTimeout(function () { var b = $("lsNew"); if (b && window.matchMedia && !window.matchMedia("(pointer: coarse)").matches) b.focus(); }, 60);
  }
  function close() {
    var sh = $("lsSheet"); if (!sh || !sh.classList.contains("show")) return;
    sh.classList.remove("show"); curId = null; delArm = null;
    // the category list shows item counts, so refresh it, keeping the scroll place
    var y = window.scrollY;
    try { if (window.currentCategory && window.showCategoryScreen) window.showCategoryScreen(window.currentCategory); } catch (e) {}
    window.scrollTo(0, y);
  }
  function wire() {
    $("lsItems").addEventListener("click", function (ev) {
      var t = ev.target.closest("button"); if (!t) return;
      if (t.classList.contains("ls-box")) { var i = +t.dataset.i; mutate(function (items) { items[i].done = !items[i].done; }); }
      if (t.classList.contains("ls-del")) { var d = +t.dataset.d; mutate(function (items) { items.splice(d, 1); }); }
    });
    $("lsAdd").addEventListener("click", addFromBox);
    $("lsNew").addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); addFromBox(); } });
    $("lsClear").addEventListener("click", function () { mutate(function (items) { for (var k = items.length - 1; k >= 0; k--) if (items[k].done) items.splice(k, 1); }); });
    $("lsDel").addEventListener("click", function () {
      // two taps: the first arms it, the second deletes (the page cannot show a confirm dialog)
      if (!delArm) { delArm = setTimeout(function () { delArm = null; $("lsDel").textContent = "Delete list"; }, 3000); $("lsDel").textContent = "Tap again to delete"; return; }
      clearTimeout(delArm); delArm = null;
      put(all().filter(function (x) { return x.id !== curId; }));
      close();
    });
  }
  window.ListSheet = { open: open, close: close, _items: itemsOf, _render: render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
