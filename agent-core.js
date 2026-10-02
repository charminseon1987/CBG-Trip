/* ============================================================
   Core — 에이전트들이 공유하는 바닥
   · 상태(일정·커서) 보관과 저장
   · 에이전트 등록부와 메시지 버스
   · db / assets / sample / downloads 연결
   ============================================================ */
window.Core = (function () {
  "use strict";
  var REG = (window.REGIONS = window.REGIONS || {});
  if (window.ELAND && !REG.everland) REG.everland = window.ELAND;
  var D = REG.everland || window.ELAND || null;
  var regionKey = D ? "everland" : null;

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

  var KEY = "everland-1003-plan";   /* 여행을 열 때 여행별 키로 바뀐다 */
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
  var agents = {}, order = [];
  function register(a) {
    agents[a.id] = a;
    if (order.indexOf(a.id) === -1) order.push(a.id);
    a.busy = false;
    emit("agents", agents);
  }
  function list() { return order.map(function (id) { return agents[id]; }); }

  /* 한 에이전트의 도구만 (이름 그대로) */
  function agentTools(id) {
    var a = agents[id];
    if (!a) return [];
    return (a.tools || []).map(function (t) {
      return {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || { type: "object", properties: {} },
        execute: function (input) {
          var r;
          try { r = t.execute(input || {}); } catch (e) { r = { error: String(e) }; }
          log(id, t.name, input, r);
          return r;
        }
      };
    });
  }
  /* 전체 도구 (접두사 붙여서) — 폴백 라우터가 쓴다 */
  function tools() {
    var out = [];
    order.forEach(function (k) {
      agentTools(k).forEach(function (t) {
        out.push({ name: k + "_" + t.name, description: "[" + agents[k].name + "] " + t.description, inputSchema: t.inputSchema, execute: t.execute });
      });
    });
    return out;
  }

  /* ---------- 활동 기록 ---------- */
  var activity = [];
  function log(agentId, tool, input, result) {
    var e = { at: Date.now(), agent: agentId, tool: tool, input: input || null, ok: !(result && result.error) };
    activity.unshift(e);
    if (activity.length > 60) activity.pop();
    emit("activity", activity);
    return e;
  }
  function setBusy(id, v) { if (agents[id]) { agents[id].busy = v; emit("agents", agents); } }

  /* ---------- 에이전트에게 일을 맡긴다 ---------- */
  function delegate(id, task) {
    var a = agents[id];
    if (!a) return Promise.resolve({ text: "그런 에이전트가 없습니다.", ok: false });
    var sample = caps.sample;
    setBusy(id, true);

    if (!sample) {                      /* 모델이 없으면 규칙으로 */
      var r = a.fallback ? a.fallback(task) : null;
      setBusy(id, false);
      return Promise.resolve({ text: null, data: r, ok: true, offline: true });
    }
    var sys = a.persona + "\n\n너는 '" + a.name + " 에이전트'다. 네 도구만 쓸 수 있다. "
      + "도구를 호출해 사실을 확인한 뒤, 한국어 한두 문장으로 결과만 답하라. 숫자는 지어내지 말고 도구 결과를 그대로 인용하라.";
    return sample([{ role: "user", content: sys + "\n\n맡은 일: " + task }], {
      tools: agentTools(id), modelTier: "quick"
    }).then(function (r) {
      setBusy(id, false);
      return { text: (r && r.text) || "", ok: true };
    }).catch(function (e) {
      setBusy(id, false);
      var rr = a.fallback ? a.fallback(task) : null;
      return { text: null, data: rr, ok: false, code: (e && e.code) || "error" };
    });
  }


  /* ---------- 냥이 아이콘 (우리집 회색 냥이) ---------- */
  function cat(opt) {
    opt = opt || {};
    var size = opt.size || 28, collar = opt.fur || "var(--indigo)", cls = opt.cls || "";
    var fur = "#8E9AA8", fur2 = "#78848F", ear = "#E7B6C4", eye = "#9CC46A", dark = "#4A4752";
    return '<svg class="catico ' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 48 48" aria-hidden="true">'
      /* 귀 */
      + '<path d="M9.5 21 L8 5.5 L22 14 Z" fill="' + fur2 + '"/>'
      + '<path d="M38.5 21 L40 5.5 L26 14 Z" fill="' + fur2 + '"/>'
      + '<path d="M12.2 18.6 L11.2 9.8 L18.6 14.4 Z" fill="' + ear + '"/>'
      + '<path d="M35.8 18.6 L36.8 9.8 L29.4 14.4 Z" fill="' + ear + '"/>'
      /* 얼굴 */
      + '<path d="M24 12.5 c9.6 0 15.5 6.4 15.5 14.2 0 7.6 -6.6 12.6 -15.5 12.6 S8.5 34.3 8.5 26.7 C8.5 18.9 14.4 12.5 24 12.5 Z" fill="' + fur + '"/>'
      + '<ellipse cx="24" cy="31.4" rx="8.6" ry="6" fill="#A6B1BD" opacity=".55"/>'
      /* 눈 */
      + '<ellipse cx="17.3" cy="25.4" rx="3.5" ry="3.9" fill="' + eye + '"/>'
      + '<ellipse cx="30.7" cy="25.4" rx="3.5" ry="3.9" fill="' + eye + '"/>'
      + '<ellipse cx="17.3" cy="25.6" rx="1.3" ry="3" fill="' + dark + '"/>'
      + '<ellipse cx="30.7" cy="25.6" rx="1.3" ry="3" fill="' + dark + '"/>'
      + '<circle cx="18.4" cy="23.6" r=".9" fill="#fff" opacity=".95"/>'
      + '<circle cx="31.8" cy="23.6" r=".9" fill="#fff" opacity=".95"/>'
      /* 코·입 */
      + '<path d="M24 31.2 l-1.9 -1.7 h3.8 Z" fill="' + ear + '"/>'
      + '<path d="M24 31.4 v1.4 M24 32.8 q-2 1.7 -3.6 .2 M24 32.8 q2 1.7 3.6 .2" fill="none" stroke="' + dark + '" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>'
      /* 수염 */
      + '<g stroke="#D9DEE4" stroke-width="1.1" stroke-linecap="round">'
      + '<path d="M6.5 27 l6 -1 M6.8 30.5 l6 -1.6 M41.5 27 l-6 -1 M41.2 30.5 l-6 -1.6"/></g>'
      /* 목도리(에이전트 색) */
      + '<path d="M13.6 37.6 q10.4 5 20.8 0 l1.2 3.4 q-11.6 5.6 -23.2 0 Z" fill="' + collar + '"/>'
      + '<circle cx="24" cy="43.4" r="2.6" fill="' + collar + '"/>'
      + '<circle cx="24" cy="43.4" r="1.1" fill="#fff" opacity=".7"/>'
      + '</svg>';
  }
  /* 에이전트별 냥이 얼굴 사진 (우리집 러시안블루) */
  var FACE = { chief: "cat-chief.jpg", plan: "cat-plan.jpg", album: "cat-album.jpg", ledger: "cat-ledger.jpg", designer: "cat-designer.jpg", sleep: "cat-sleep.jpg" };
  var ALT = { chief: "총괄 냥이", plan: "일정 냥이", album: "앨범 냥이", ledger: "가계부 냥이", designer: "설계 냥이", sleep: "자는 냥이" };
  function catPic(id, opt) {
    opt = opt || {};
    var f = FACE[id];
    if (!f) return cat({ size: opt.size || 28, fur: opt.fur });
    var st = opt.size ? ' style="width:' + opt.size + "px;height:" + opt.size + 'px"' : "";
    return '<img class="catpic ' + (opt.cls || "") + '" src="' + f + '" alt="' + ALT[id] + '"' + st + ' loading="lazy">';
  }

  /* 발바닥 */
  function paw(opt) {
    opt = opt || {};
    var size = opt.size || 20, c = opt.fur || "var(--indigo)";
    return '<svg class="catico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">'
      + '<ellipse cx="12" cy="15.5" rx="6" ry="5" fill="' + c + '"/>'
      + '<ellipse cx="5.6" cy="9.5" rx="2.5" ry="3" fill="' + c + '"/>'
      + '<ellipse cx="10" cy="6.6" rx="2.4" ry="3" fill="' + c + '"/>'
      + '<ellipse cx="14.8" cy="6.6" rx="2.4" ry="3" fill="' + c + '"/>'
      + '<ellipse cx="18.8" cy="9.8" rx="2.4" ry="2.9" fill="' + c + '"/></svg>';
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
    });
    use("assets").then(function (a) { caps.assets = a; emit("cap:assets", a); });
    use("sample").then(function (s) { caps.sample = s; emit("cap:sample", s); });
    use("downloads").then(function (d) { caps.downloads = d; emit("cap:downloads", d); });
  }

  var pool = {};
  if (D) D.pool.forEach(function (p) { pool[p.id] = p; });
  try { var raw = localStorage.getItem(KEY); if (raw) adopt(JSON.parse(raw)); } catch (e) {}

  /* ---------- 여행마다 지역을 갈아 끼운다 ---------- */
  function regions() { return Object.keys(REG); }
  function useRegion(key, tripId) {
    var d = key && REG[key];
    if (!d) { D = null; Core.D = null; regionKey = null; emit("region", null); return false; }
    if (regionKey === key && KEY === "plan-" + tripId) { emit("region", { key: key, data: d }); return true; }
    D = d; Core.D = d; regionKey = key;
    Object.keys(pool).forEach(function (k) { delete pool[k]; });      /* 참조는 그대로 두고 내용만 교체 */
    d.pool.forEach(function (p) { pool[p.id] = p; });
    KEY = "plan-" + (tripId || key);
    planDoc = null;
    state.items = d.plan.map(function (p) { return p.id; });
    state.start = (d.plan[0] && d.plan[0].time) || "09:00";
    state.cursor = 0;
    state.sat = false;
    state.zone = (d.zones && d.zones[0] && d.zones[0].id) || "06";
    try { var r2 = localStorage.getItem(KEY); if (r2) adopt(JSON.parse(r2)); } catch (e) {}
    var db = caps.db;
    if (db) {
      planDoc = db.doc("trips/" + (tripId || key) + "/itinerary");
      planDoc.onSnapshot(function (snap) {
        if (writing || !snap.exists) return;
        if (adopt(snap.data())) emit("plan:external");
      }, function () {});
    }
    emit("region", { key: key, data: d, trip: tripId });
    return true;
  }

  return {
    D: D, pool: pool, state: state,
    hm: hm, toMin: toMin, hhmm: hhmm, esc: esc, shortName: shortName, signed: signed, won: won, uid: uid,
    save: save, adopt: adopt, snapshot: snapshot,
    on: on, emit: emit, register: register, agents: agents, list: list,
    tools: tools, agentTools: agentTools, delegate: delegate, log: log, activity: function () { return activity; },
    toast: toast, caps: caps, boot: boot, cat: cat, paw: paw, catPic: catPic,
    useRegion: useRegion, regions: regions, regionKey: function () { return regionKey; }
  };
})();
