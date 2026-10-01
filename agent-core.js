/* ============================================================
   Core — 에이전트들이 공유하는 바닥
   · 상태(일정·커서) 보관과 저장
   · 에이전트 등록부와 메시지 버스
   · db / assets / sample / downloads 연결
   ============================================================ */
window.Core = (function () {
  "use strict";
  var D = window.ELAND;

  /* ---------- 공통 유틸 ---------- */
  function hm(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60) % 24, m = ((min % 60) + 60) % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  function toMin(s) { var p = String(s).split(":"); return (+p[0]) * 60 + (+p[1]); }
  function hhmm(t) { return t ? t.slice(0, 2) + ":" + t.slice(2) : ""; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function shortName(s) { return String(s).split(" : ")[0].split(" — ")[0]; }
  function signed(v, unit) { return (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(Math.round(v)) + unit; }
  function won(n) { return (Math.round(n) || 0).toLocaleString("ko-KR") + "원"; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- 상태 ---------- */
  var state = {
    items: D ? D.plan.map(function (p) { return p.id; }) : [],
    start: "09:30",
    sat: false,
    cursor: 0,
    zone: "06"
  };

  var KEY = "everland-1003-plan";
  var planDoc = null, writing = false;

  function snapshot() { return { items: state.items.slice(), start: state.start, sat: state.sat, cursor: state.cursor }; }
  function adopt(o) {
    if (!o || !Array.isArray(o.items)) return false;
    var ok = o.items.filter(function (x) { return Core.pool[x]; });
    if (!ok.length) return false;
    state.items = ok;
    if (o.start) state.start = o.start;
    state.sat = !!o.sat;
    state.cursor = Math.min(Math.max(0, o.cursor | 0), ok.length - 1);
    return true;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) {}
    if (planDoc && !writing) {
      writing = true;
      var payload = snapshot();
      payload.updatedAt = new Date().toISOString();
      planDoc.set(payload).catch(function () {}).then(function () { writing = false; });
    }
  }

  /* ---------- 메시지 버스 ---------- */
  var subs = {};
  function on(topic, fn) { (subs[topic] = subs[topic] || []).push(fn); }
  function emit(topic, data) { (subs[topic] || []).forEach(function (f) { try { f(data); } catch (e) {} }); }

  /* ---------- 에이전트 등록부 ---------- */
  var agents = {};
  function register(a) { agents[a.id] = a; emit("agents", agents); }
  function tools() {
    var out = [];
    Object.keys(agents).forEach(function (k) {
      (agents[k].tools || []).forEach(function (t) {
        out.push({
          name: k + "_" + t.name,
          description: "[" + agents[k].name + " 에이전트] " + t.description,
          inputSchema: t.inputSchema || { type: "object", properties: {} },
          execute: t.execute
        });
      });
    });
    return out;
  }

  /* ---------- 토스트 ---------- */
  var toastT = null;
  function toast(html, kind) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.className = "toast " + (kind || "");
    el.innerHTML = html;
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.hidden = true; }, 5200);
  }

  /* ---------- 런타임 연결 ---------- */
  var caps = { db: null, assets: null, sample: null, downloads: null };
  function use(name) {
    if (!window.claude || !window.claude.use) return Promise.resolve(null);
    return window.claude.use(name).catch(function () { return null; });
  }
  function boot() {
    use("db").then(function (db) {
      caps.db = db;
      emit("cap:db", db);
      if (!db) return;
      planDoc = db.doc("plan/itinerary");
      planDoc.onSnapshot(function (snap) {
        if (writing || !snap.exists) return;
        if (adopt(snap.data())) emit("plan:external");
      }, function () {});
    });
    use("assets").then(function (a) { caps.assets = a; emit("cap:assets", a); });
    use("sample").then(function (s) { caps.sample = s; emit("cap:sample", s); });
    use("downloads").then(function (d) { caps.downloads = d; emit("cap:downloads", d); });
  }

  try { var raw = localStorage.getItem(KEY); if (raw) adopt(JSON.parse(raw)); } catch (e) {}

  var pool = {};
  if (D) D.pool.forEach(function (p) { pool[p.id] = p; });

  return {
    D: D, pool: pool, state: state,
    hm: hm, toMin: toMin, hhmm: hhmm, esc: esc, shortName: shortName, signed: signed, won: won, uid: uid,
    save: save, adopt: adopt, snapshot: snapshot,
    on: on, emit: emit, register: register, agents: agents, tools: tools,
    toast: toast, caps: caps, boot: boot
  };
})();
