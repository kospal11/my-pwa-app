// Bills: storage, due-date maths and phone reminders. Used by bills.html and by the home screen card.
(function () {
  var KEY = "bills";

  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "b" + Date.now() + Math.random().toString(16).slice(2); }

  // ---- dates are plain "YYYY-MM-DD" strings in local time ----
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function today() { return ymd(new Date()); }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDays(a, b) {   // b - a in whole days
    var da = parse(a), db = parse(b);
    return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
  }

  // The day after `s` for this bill's repeat rule (keeps the original day of the month, e.g. the 31st)
  function nextDate(s, repeat, anchorDay) {
    var d = parse(s);
    if (repeat === "weekly") return addDays(s, 7);
    var anchor = anchorDay || d.getDate();
    if (repeat === "monthly") {
      var y = d.getFullYear(), m = d.getMonth() + 1;
      if (m > 11) { m = 0; y++; }
      return y + "-" + pad(m + 1) + "-" + pad(Math.min(anchor, daysInMonth(y, m)));
    }
    if (repeat === "yearly") {
      var y2 = d.getFullYear() + 1, m2 = d.getMonth();
      return y2 + "-" + pad(m2 + 1) + "-" + pad(Math.min(anchor, daysInMonth(y2, m2)));
    }
    return null;
  }

  function isRecurring(b) { return b.repeat === "weekly" || b.repeat === "monthly" || b.repeat === "yearly"; }
  function isDone(b) { return !isRecurring(b) && !!b.paidAt; }   // a one-off that has been paid

  // Every date a bill falls on inside [from, to]: paid ones from history, then the open one and its future repeats
  function occurrences(b, from, to) {
    var out = [], i;
    (b.history || []).forEach(function (h) {
      if (h.due >= from && h.due <= to) out.push({ bill: b, date: h.due, paid: true, current: false, paidAt: h.paidAt });
    });
    if (!isRecurring(b)) {
      if (b.due >= from && b.due <= to) out.push({ bill: b, date: b.due, paid: !!b.paidAt, current: !b.paidAt, paidAt: b.paidAt });
      return out;
    }
    var d = b.due, n = 0;
    while (d && d <= to && n < 800) {
      if (d >= from) out.push({ bill: b, date: d, paid: false, current: d === b.due });
      d = nextDate(d, b.repeat, b.anchorDay); n++;
    }
    return out;
  }

  function status(occ, t) {
    t = t || today();
    if (occ.paid) return "paid";
    if (occ.date < t) return "overdue";
    var left = diffDays(t, occ.date);
    return left <= 7 ? "soon" : "later";
  }

  function pay(id) {
    var list = load(), b = list.filter(function (x) { return x.id === id; })[0];
    if (!b || isDone(b)) return null;
    var stamp = new Date().toISOString();
    if (isRecurring(b)) {
      b.history = b.history || [];
      b.history.push({ due: b.due, paidAt: stamp, amount: b.amount });
      b.due = nextDate(b.due, b.repeat, b.anchorDay);
    } else {
      b.paidAt = stamp;
    }
    save(list);
    schedule(b);
    return b;
  }
  function undoPay(id) {
    var list = load(), b = list.filter(function (x) { return x.id === id; })[0];
    if (!b) return null;
    if (isRecurring(b)) {
      var h = (b.history || []).pop();
      if (h) b.due = h.due;
    } else {
      delete b.paidAt;
    }
    save(list); schedule(b);
    return b;
  }

  // What the home card needs: overdue count, and the next unpaid bill
  function summary() {
    var list = load(), t = today(), open = [];
    list.forEach(function (b) { if (!isDone(b)) open.push({ bill: b, date: b.due }); });
    open.sort(function (a, c) { return a.date < c.date ? -1 : a.date > c.date ? 1 : 0; });
    var overdue = open.filter(function (o) { return o.date < t; });
    var week = open.filter(function (o) { return o.date >= t && diffDays(t, o.date) <= 7; });
    return { count: list.length, open: open, overdue: overdue, week: week, next: open[0] || null };
  }

  function relative(date, t) {
    t = t || today();
    var n = diffDays(t, date);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "yesterday";
    if (n < 0) return Math.abs(n) + " days overdue";
    if (n <= 14) return "in " + n + " days";
    return parse(date).toLocaleDateString([], { day: "numeric", month: "short" });
  }

  function money(v) {
    var n = Number(v);
    if (!isFinite(n) || v === "" || v == null) return "";
    return "€" + (Math.round(n) === n ? n.toFixed(0) : n.toFixed(2));
  }

  // ---- phone notifications (need Capacitor's Local Notifications plugin; otherwise silently skipped) ----
  function LN() { try { return (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications) || null; } catch (e) { return null; } }
  function nid(id) {
    var h = 0, s = "bill:" + id;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2147483000) + 100;
  }
  function reminderAt(b) {
    if (b.remind === undefined || b.remind === null || b.remind === "" || Number(b.remind) < 0 || isDone(b)) return null;
    var d = parse(addDays(b.due, -Number(b.remind)));
    if (!d) return null;
    d.setHours(9, 0, 0, 0);
    return d;
  }
  function cancel(b) {
    var ln = LN(); if (!ln) return Promise.resolve();
    return ln.cancel({ notifications: [{ id: nid(b.id) }] }).catch(function () {});
  }
  // askPermission: true when the user has just saved a bill with a reminder
  function schedule(b, askPermission) {
    var ln = LN(); if (!ln) return Promise.resolve();
    var at = reminderAt(b);
    return cancel(b).then(function () {
      if (!at) return;
      return ln.checkPermissions().then(function (p) {
        if (p.display === "granted") return true;
        return askPermission ? ln.requestPermissions().then(function (r) { return r.display === "granted"; }) : false;
      }).then(function (ok) {
        if (!ok) return;
        var when = at;
        if (when <= new Date()) {
          // already past: for repeating bills aim at the next period
          if (!isRecurring(b)) return;
          var nd = nextDate(b.due, b.repeat, b.anchorDay);
          when = parse(addDays(nd, -Number(b.remind))); when.setHours(9, 0, 0, 0);
          if (when <= new Date()) return;
        }
        var body = b.name + (Number(b.amount) ? " – " + money(b.amount) : "") + (Number(b.remind) ? " is due " + (Number(b.remind) === 1 ? "tomorrow" : "in " + b.remind + " days") : " is due today");
        var sched = { at: when, allowWhileIdle: true };
        var ev = { weekly: "week", monthly: "month", yearly: "year" }[b.repeat];
        if (ev) sched.every = ev;
        return ln.schedule({ notifications: [{ id: nid(b.id), title: "Bill reminder", body: body, smallIcon: "ic_stat_cat", iconColor: "#FFA62B", schedule: sched }] });
      });
    }).catch(function (e) { try { console.warn("Bill reminder not scheduled", e); } catch (x) {} });
  }
  // Re-register every reminder (call when the app opens)
  function resync() { load().forEach(function (b) { schedule(b, false); }); }

  window.Bills = {
    load: load, save: save, uid: uid, ymd: ymd, parse: parse, today: today, addDays: addDays, diffDays: diffDays,
    daysInMonth: daysInMonth, nextDate: nextDate, isRecurring: isRecurring, isDone: isDone,
    occurrences: occurrences, status: status, pay: pay, undoPay: undoPay, summary: summary,
    relative: relative, money: money, schedule: schedule, cancel: cancel, resync: resync
  };
})();
