/* ============================================================
   쉘 — 여행 목록 → 여행 상세(탭 3개)
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core;

  var HOME = { id: "everland-1003", title: "에버랜드", date: "2026-10-03", end: "2026-10-03", place: "용인 에버랜드", people: 4, theme: "아이와", region: "everland", builtin: true };
  var LKEY = "everland-trips";
  var trips = [HOME], col = null, current = null;

  var listEl = document.getElementById("tripList"),
      screenList = document.getElementById("screenList"),
      screenTrip = document.getElementById("screenTrip"),
      titleEl = document.getElementById("tripTitle"),
      subEl = document.getElementById("tripSub"),
      tabsEl = document.getElementById("tabs");

  /* 장소 이름에서 지역팩을 고른다 — 팩이 있으면 에버랜드와 같은 지도 화면이 열린다 */
  var PLACE = { gyeongju: ["경주", "gyeongju", "불국사", "황리단길", "보문"],
                everland: ["에버랜드", "everland", "용인"] };
  function regionOf(t) {
    if (t.region && window.REGIONS && window.REGIONS[t.region]) return t.region;
    var hay = ((t.place || "") + " " + (t.title || "")).toLowerCase();
    var hit = null;
    Object.keys(PLACE).forEach(function (k) {
      if (hit || !(window.REGIONS && window.REGIONS[k])) return;
      PLACE[k].forEach(function (w) { if (!hit && hay.indexOf(w.toLowerCase()) !== -1) hit = k; });
    });
    return hit;
  }

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

  function span(d, e) {
    if (!d) return "";
    return e && e !== d ? d + " ~ " + e : d;
  }
  function renderList() {
    listEl.innerHTML = trips.map(function (t) {
      var meta = "";
      if (t.people) meta += "<span>👥 " + (+t.people) + "명</span>";
      if (t.theme) meta += "<span>" + C.esc(t.theme) + "</span>";
      return '<button class="tcard" data-trip="' + C.esc(t.id) + '">'
        + '<span class="tdate">' + C.esc(span(t.date, t.end)) + "</span>"
        + '<span class="ttitle">' + C.esc(t.title || "여행") + "</span>"
        + '<span class="tplace">' + C.esc(t.place || "") + "</span>"
        + (meta ? '<span class="tmeta">' + meta + "</span>" : "")
        + (t.id === HOME.id ? '<span class="tbadge">' + C.paw({ size: 13, fur: "var(--indigo)" }) + ' 경로 안내 있음</span>' : "")
        + "</button>";
    }).join("") + '<button class="tcard add" id="newTrip">' + C.catPic("plan", { size: 42 }) + '<span class="plus"><span class="ttitle">새 여행</span></button>';
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
      end: document.getElementById("ntDate2").value || "",
      place: document.getElementById("ntPlace").value.trim(),
      people: +document.getElementById("ntPeople").value || 1,
      theme: document.getElementById("ntTheme").value
    };
    t.region = regionOf(t);
    if (col) col.doc(t.id).set({ title: t.title, date: t.date, end: t.end, place: t.place, people: t.people, theme: t.theme }).catch(function () {});
    var extra = localTrips().concat([t]);
    saveLocal(trips.concat([t]));
    merge(extra);
    this.reset();
    this.hidden = true;
    open(t.id);
    C.emit("trip:new", t);
  });

  function open(id) {
    var t = trips.filter(function (x) { return x.id === id; })[0] || HOME;
    current = t;
    titleEl.textContent = t.title;
    subEl.textContent = span(t.date, t.end) + (t.place ? " · " + t.place : "") + (t.people ? " · " + t.people + "명" : "");
    screenList.hidden = true;
    screenTrip.hidden = false;
    chrome(true);
    var rk = regionOf(t);
    t.region = rk || t.region;
    var mapped = C.useRegion(rk, t.id);
    document.getElementById("planUnavailable").hidden = mapped;
    document.getElementById("planBody").hidden = !mapped;
    var cl = document.getElementById("closingSec");
    if (cl) cl.hidden = (rk !== "everland");
    tab("home");
    window.scrollTo(0, 0);
    C.emit("trip:open", t);
  }

  document.getElementById("backToList").addEventListener("click", function () {
    screenTrip.hidden = true;
    screenList.hidden = false;
    chrome(false);
    window.scrollTo(0, 0);
  });

  /* 목록 화면에서는 여행 전용 메뉴(뒤로·여행이름·탭)를 숨긴다 */
  function chrome(onTrip) {
    document.getElementById("appbar").classList.toggle("list-mode", !onTrip);
    document.getElementById("backToList").hidden = !onTrip;
    tabsEl.hidden = !onTrip;
    if (!onTrip) {
      titleEl.textContent = "우리 여행 기록";
      subEl.textContent = "여행을 고르면 일정 · 앨범 · 가계부가 열립니다";
    }
  }

  function tab(id) {
    ["home", "plan", "album", "ledger"].forEach(function (k) {
      document.getElementById("tab-" + k).hidden = (k !== id);
      var b = tabsEl.querySelector('[data-tab="' + k + '"]');
      if (b) b.setAttribute("aria-selected", String(k === id));
    });
    document.querySelector(".topnav").classList.toggle("home-mode", id === "home");
    window.scrollTo(0, 0);
    C.emit("tab", id);
  }
  tabsEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]");
    if (b) tab(b.getAttribute("data-tab"));
  });

  window.Shell = { open: open, tab: tab, current: function () { return current; } };

  /* 냥이 심기 */
  var logo = document.getElementById("appLogo");
  if (logo) logo.innerHTML = '<img class="logocat" src="cat-face.jpg" alt="우리집 냥이">';
  var hero = document.getElementById("heroCat");
  if (hero) hero.innerHTML = C.catPic("chief", { size: 46 });

  /* 첫 화면: 여행이 하나뿐이면 바로 그 여행을 연다 */
  renderList();
  open(HOME.id);
})();
