// Sharing helpers used by the main page and the lists page.
(function () {
  var ICONS = { Cinema: "🎬", Food: "🍽️", Drinks: "🥤", Other: "🧩" };

  // ---- TV series helpers (Cinema entries with kind === "tv") ----
  function isTV(e) { return !!e && e.type === "Cinema" && e.kind === "tv"; }
  function tvProgress(e) {
    var s = parseInt(e.season, 10) || 0, ep = parseInt(e.episode, 10) || 0, out = [];
    if (s) out.push("S" + s);
    if (ep) out.push("E" + ep);
    return out.join(" ");
  }
  var TV_STATUS = { watching: "Watching", plan: "Plan to watch", paused: "On hold", finished: "Finished" };
  // A ticked entry is finished; "finished" with the tick removed falls back to watching.
  function tvStatus(e) {
    if (e.checked) return "finished";
    if (e.tvStatus === "finished") return "watching";
    return TV_STATUS[e.tvStatus] ? e.tvStatus : "watching";
  }

  function nameOf(e) { return e.placeName || e.movieName || e.otherName || "Entry"; }
  function subOf(e) { return e.cuisineType || e.drinkType || e.genre || e.cinemaName || e.otherType || ""; }

  function day(v) {
    if (!v) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
    return isNaN(d) ? "" : d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  }

  // One line per entry:  "1. Taverna Nikos (Greek) ⭐⭐⭐⭐⭐ – try the lamb"
  function line(e, n) {
    var s = n + ". " + nameOf(e);
    var sub = subOf(e);
    if (isTV(e)) {
      var pr = tvProgress(e);
      sub = [sub, "TV series" + (pr ? " " + pr : "")].filter(Boolean).join(" · ");
    }
    if (sub) s += " (" + sub + ")";
    var r = Number(e.Rating);
    if (r > 0) s += " " + "⭐".repeat(Math.min(5, r));
    if (e.note) s += " – " + String(e.note).replace(/\s+/g, " ").trim();
    return s;
  }

  // title: "Crete trip", subtitle: optional, items: entries, group: split by category when mixed
  function buildList(title, subtitle, items, intro) {
    var out = [];
    out.push((intro || "📝") + " " + title);
    if (subtitle) out.push(subtitle);
    out.push("");

    var types = [];
    items.forEach(function (e) { var t = e.type || "Other"; if (types.indexOf(t) < 0) types.push(t); });

        var order = ["Food", "Drinks", "Cinema", "Other"];
    types.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });

    if (types.length <= 1) {
      items.forEach(function (e, i) { out.push(line(e, i + 1)); });
    } else {
      types.forEach(function (t) {
        out.push((ICONS[t] || "") + " " + t);
        var n = 0;
        items.filter(function (e) { return (e.type || "Other") === t; })
             .forEach(function (e) { out.push(line(e, ++n)); });
        out.push("");
      });
    }
    return out.join("\n").trim();
  }

  function toast(msg) {
    var t = document.getElementById("shareToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "shareToast";
      t.style.cssText = "position:fixed;left:50%;bottom:calc(110px + env(safe-area-inset-bottom));transform:translateX(-50%);" +
        "background:var(--surface-2,#23262D);color:var(--text,#fff);padding:10px 16px;border-radius:20px;z-index:99999;" +
        "font-weight:700;font-size:0.9rem;box-shadow:0 6px 20px rgba(0,0,0,.35);max-width:90vw;text-align:center;display:none;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = "none"; }, 2600);
  }

  function copyFallback(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  // Opens the phone's share sheet (WhatsApp, Viber, Messages...). If that isn't available, copies the text.
  function send(text, title) {
    function copied() { toast("Copied. Paste it into any chat."); }
    function copy() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(copied, function () {
          if (copyFallback(text)) copied(); else toast("Couldn't copy.");
        });
      } else if (copyFallback(text)) copied();
      else toast("Couldn't copy.");
    }
    if (navigator.share) {
      navigator.share({ title: title || "Shared from my notes", text: text }).catch(function (err) {
        if (err && err.name === "AbortError") return;   // user closed the sheet
        copy();
      });
    } else {
      copy();
    }
  }

  window.Share = { build: buildList, send: send, toast: toast, nameOf: nameOf, subOf: subOf, day: day,
    isTV: isTV, tvProgress: tvProgress, tvStatus: tvStatus, TV_STATUS: TV_STATUS };
})();
