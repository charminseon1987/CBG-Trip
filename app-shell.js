/* ============================================================
   쉘 — 여행 목록 → 여행 상세(탭 3개)
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core;

  var HOME = { id: "everland-1003", title: "에버랜드", date: "2026-10-03", place: "용인 에버랜드", builtin: true };
  var LKEY = "everland-trips";
  var trips = [HOME], col = null, current = null;

  var listEl = document.getElementById("tripList"),
      screenList = document.getElementById("screenList"),
      screenTrip = document.getElementById("screenTrip"),
      titleEl = document.getElementById("tripTitle"),
      subEl = document.getElementById("tripSub"),
      tabsEl = document.getElementById("tabs");

  function localTrips() {
    try { return JSON.parse(localStorage.getItem(LKEY) || "[]"); } catch (e) { return []; }
  }
  function saveLocal(list) {
    try { localStorage.setItem(LKEY, JSON.stringify(list.filter(function (t) { return !t.builtin; }))); } catch (e) {}
  }
  function merge(extra) {
    var seen = {}, out = [HOME];
    extra.forEach(function (t) { if (t && t.id && t.id !== HOME.id && !seen[t.id]) { seen[t.id] = 1; out.push(t); } });
    trips = out;
    renderList();
  }
  merge(localTrips());

  C.on("cap:db", function (db) {
    if (!db) return;
    col = db.collection("trips");
    col.onSnapshot(function (snap) {
      merge(snap.docs.map(function (d) { var o = d.data() || {}; o.id = d.id; return o; }));
    }, function () {});
  });

  function renderList() {
    listEl.innerHTML = trips.map(function (t) {
      return '<button class="tcard" data-trip="' + C.esc(t.id) + '">'
        + '<span class="tdate">' + C.esc(t.date || "") + "</span>"
        + '<span class="ttitle">' + C.esc(t.title || "여행") + "</span>"
        + '<span class="tplace">' + C.esc(t.place || "") + "</span>"
        + (t.id === HOME.id ? '<span class="tbadge">경로 안내 있음</span>' : "")
        + "</button>";
    }).join("") + '<button class="tcard add" id="newTrip"><span class="plus">+</span><span class="ttitle">새 여행</span></button>';
  }

  listEl.addEventListener("click", function (e) {
    var card = e.target.closest("[data-trip]");
    if (card) { open(card.getAttribute("data-trip")); return; }
    if (e.target.closest("#newTrip")) {
      var box = document.getElementById("newTripForm");
      box.hidden = !box.hidden;
      if (!box.hidden) document.getElementById("ntTitle").focus();
    }
  });

  document.getElementById("newTripForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = {
      id: "trip-" + C.uid(),
      title: document.getElementById("ntTitle").value.trim() || "새 여행",
      date: document.getElementById("ntDate").value || new Date().toISOString().slice(0, 10),
      place: document.getElementById("ntPlace").value.trim()
    };
    if (col) col.doc(t.id).set({ title: t.title, date: t.date, place: t.place }).catch(function () {});
    var extra = localTrips().concat([t]);
    saveLocal(trips.concat([t]));
    merge(extra);
    this.reset();
    this.hidden = true;
    open(t.id);
  });

  function open(id) {
    var t = trips.filter(function (x) { return x.id === id; })[0] || HOME;
    current = t;
    titleEl.textContent = t.title;
    subEl.textContent = (t.date || "") + (t.place ? " · " + t.place : "");
    screenList.hidden = true;
    screenTrip.hidden = false;
    document.getElementById("planUnavailable").hidden = (t.id === HOME.id);
    document.getElementById("planBody").hidden = (t.id !== HOME.id);
    tab("plan");
    window.scrollTo(0, 0);
    C.emit("trip:open", t);
  }

  document.getElementById("backToList").addEventListener("click", function () {
    screenTrip.hidden = true;
    screenList.hidden = false;
    window.scrollTo(0, 0);
  });

  function tab(id) {
    ["plan", "album", "ledger"].forEach(function (k) {
      document.getElementById("tab-" + k).hidden = (k !== id);
      var b = tabsEl.querySelector('[data-tab="' + k + '"]');
      if (b) b.setAttribute("aria-selected", String(k === id));
    });
    C.emit("tab", id);
  }
  tabsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (b) tab(b.getAttribute("data-tab"));
  });

  window.Shell = { open: open, tab: tab, current: function () { return current; } };

  /* 첫 화면: 여행이 하나뿐이면 바로 그 여행을 연다 */
  renderList();
  open(HOME.id);
})();
