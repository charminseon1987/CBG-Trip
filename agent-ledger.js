/* ============================================================
   회계 에이전트 — 지출 입력 · 분류별 집계 · CSV
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core;

  var CATS = [
    { id: "ticket", name: "입장권·이용권", color: "var(--indigo)" },
    { id: "car", name: "차량유지비", color: "var(--z-amer)" },
    { id: "food", name: "식비", color: "var(--z-zoo)" },
    { id: "snack", name: "간식·음료", color: "var(--gold)" },
    { id: "gift", name: "기념품", color: "var(--rose)" },
    { id: "etc", name: "기타", color: "var(--muted)" }
  ];
  function catName(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].name; return "기타"; }
  function catColor(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].color; return "var(--muted)"; }

  var rows = [], col = null, tripId = null, unsub = null, people = 4;

  var sumEl = document.getElementById("ledSum"),
      listEl = document.getElementById("ledList"),
      formEl = document.getElementById("ledForm"),
      catEl = document.getElementById("ledCat"),
      peopleEl = document.getElementById("ledPeople"),
      csvEl = document.getElementById("ledCsv");

  catEl.innerHTML = CATS.map(function (c) { return '<option value="' + c.id + '">' + c.name + "</option>"; }).join("");

  /* db가 없으면 브라우저에 저장한다 */
  function lkey() { return "everland-expenses-" + tripId; }
  function loadLocal() {
    try { rows = JSON.parse(localStorage.getItem(lkey()) || "[]"); } catch (e) { rows = []; }
    rows.sort(function (a, b) { return (a.min || 0) - (b.min || 0); });
  }
  function saveLocal() { try { localStorage.setItem(lkey(), JSON.stringify(rows)); } catch (e) {} }

  function bind(id) {
    tripId = id; rows = [];
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    col = C.caps.db ? C.caps.db.collection("trips/" + id + "/expenses") : null;
    if (col) {
      unsub = col.onSnapshot(function (snap) {
        rows = snap.docs.map(function (d) { var o = d.data() || {}; o._id = d.id; return o; });
        rows.sort(function (a, b) { return (a.min || 0) - (b.min || 0); });
        render();
      }, function () {});
    } else loadLocal();
    render();
  }

  function placeOf(min) {
    if (window.PlanAgent && tripId === "everland-1003") {
      var w = window.PlanAgent.whereAt(min);
      if (w) return w.row.p.name.split(" — ").pop().split(" : ")[0];
    }
    return "";
  }

  function add(amount, cat, memo, min) {
    var now = new Date();
    min = (min == null) ? now.getHours() * 60 + now.getMinutes() : min;
    var doc = { amount: Math.round(amount), cat: cat, memo: memo || "", min: min, place: placeOf(min), at: new Date().toISOString() };
    if (col) col.doc(C.uid()).set(doc).catch(function () {});
    else { doc._id = C.uid(); rows.push(doc); rows.sort(function (a, b) { return a.min - b.min; }); saveLocal(); render(); }
    return { ok: true, doc: doc };
  }

  function totals() {
    var by = {}, sum = 0;
    CATS.forEach(function (c) { by[c.id] = 0; });
    rows.forEach(function (r) { by[r.cat] = (by[r.cat] || 0) + (r.amount || 0); sum += r.amount || 0; });
    return { by: by, sum: sum };
  }

  function render() {
    var t = totals(), max = Math.max.apply(null, CATS.map(function (c) { return t.by[c.id] || 0; }).concat([1]));
    sumEl.innerHTML = '<div class="ledtop"><div><div class="ledtot">' + C.won(t.sum) + "</div>"
      + '<div class="dim">' + rows.length + "건 · 1인당 " + C.won(t.sum / Math.max(1, people)) + " (" + people + "명)</div></div>"
      + '<button class="btn sm" id="ledCsvBtn">CSV로 저장</button></div>'
      + '<div class="bars">' + CATS.map(function (c) {
        var v = t.by[c.id] || 0;
        return '<div class="bar"><span class="bl">' + c.name + '</span>'
          + '<span class="bt"><span style="width:' + (v / max * 100).toFixed(1) + "%;background:" + c.color + '"></span></span>'
          + '<span class="bv">' + C.won(v) + "</span></div>";
      }).join("") + "</div>";

    listEl.innerHTML = rows.length ? rows.map(function (r) {
      return '<div class="lrow"><span class="lt">' + C.hm(r.min) + "</span>"
        + '<span class="lc" style="color:' + catColor(r.cat) + '">' + catName(r.cat) + "</span>"
        + '<span class="lm">' + C.esc(r.memo || (r.place ? r.place : "—")) + (r.place && r.memo ? ' <span class="dim">· ' + C.esc(r.place) + "</span>" : "") + "</span>"
        + '<span class="la">' + C.won(r.amount) + "</span>"
        + '<button class="icb del" data-del="' + r._id + '" aria-label="삭제">&#10005;</button></div>';
    }).join("") : '<p class="dim">아직 기록이 없습니다. 위에서 금액과 분류를 넣으면 <b>그 시각에 있던 장소</b>가 함께 저장됩니다.</p>';
  }

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var amt = parseInt(document.getElementById("ledAmt").value, 10);
    if (!amt || amt <= 0) return;
    var tval = document.getElementById("ledTime").value;
    add(amt, catEl.value, document.getElementById("ledMemo").value, tval ? C.toMin(tval) : null);
    document.getElementById("ledAmt").value = "";
    document.getElementById("ledMemo").value = "";
  });
  listEl.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-del]");
    if (!b) return;
    var id = b.getAttribute("data-del");
    if (col) col.doc(id).delete().catch(function () {});
    else { rows = rows.filter(function (r) { return r._id !== id; }); saveLocal(); render(); }
  });
  peopleEl.addEventListener("change", function (e) { people = Math.max(1, +e.target.value || 1); render(); });

  function csv() {
    var head = "시각,분류,장소,메모,금액\n";
    var body = rows.map(function (r) {
      return [C.hm(r.min), catName(r.cat), r.place || "", (r.memo || "").replace(/,/g, " "), r.amount].join(",");
    }).join("\n");
    var t = totals();
    return "﻿" + head + body + "\n,,,합계," + t.sum + "\n";
  }
  sumEl.addEventListener("click", function (e) {
    if (!e.target.closest("#ledCsvBtn")) return;
    var dl = C.caps.downloads;
    if (!dl) { C.toast("이 화면에서는 저장할 수 없습니다", "warn"); return; }
    dl.save({ filename: "여행가계부-" + (tripId || "trip") + ".csv", data: csv() })
      .then(function () { C.toast("CSV를 저장했습니다", "good"); })
      .catch(function () {});
  });

  C.on("cap:db", function () { if (tripId) bind(tripId); });
  C.on("trip:open", function (t) { bind(t.id); });

  C.register({
    id: "ledger", name: "회계",
    api: { bind: bind, totals: totals },
    tools: [
      { name: "summary", description: "오늘 쓴 돈의 분류별 합계와 총액.",
        execute: function () {
          var t = totals(), by = {};
          CATS.forEach(function (c) { if (t.by[c.id]) by[c.name] = t.by[c.id]; });
          return { total: t.sum, per_person: Math.round(t.sum / Math.max(1, people)), people: people, by_category: by, count: rows.length };
        } },
      { name: "add", description: "지출을 기록한다. 분류는 ticket(입장권) car(차량유지비) food(식비) snack(간식) gift(기념품) etc(기타).",
        inputSchema: {
          type: "object",
          properties: {
            amount: { type: "number", description: "금액(원)" },
            category: { type: "string", enum: ["ticket", "car", "food", "snack", "gift", "etc"] },
            memo: { type: "string" },
            time: { type: "string", description: "HH:MM, 생략하면 현재 시각" }
          },
          required: ["amount", "category"]
        },
        execute: function (a) {
          var r = add(a.amount, a.category, a.memo, a.time ? C.toMin(a.time) : null);
          return { ok: true, saved: r.doc };
        } },
      { name: "list", description: "지출 내역 전체.",
        execute: function () {
          return rows.map(function (r) { return { time: C.hm(r.min), category: catName(r.cat), place: r.place, memo: r.memo, amount: r.amount }; });
        } }
    ]
  });
})();
