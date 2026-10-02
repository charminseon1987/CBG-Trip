/* ============================================================
   설계 에이전트 — 새 여행이 생기면 하루 일정을 짜서 화면에 올린다.
   총괄이 여행 정보를 넘기면, 장소·인원·테마에 맞는 일정을 만들어
   일정 탭에 그린다. 에버랜드처럼 경로 데이터가 있는 여행은 건드리지 않는다.
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core;
  var KEY = "trip-draft-";
  var drafts = {};          /* tripId -> {items:[...], tips:[...], madeAt} */
  var current = null;       /* 지금 열려 있는 여행 */

  var KIND = {
    move:   { label: "이동",   color: "var(--muted)",     icon: "🚗" },
    food:   { label: "식사",   color: "var(--z-zoo)",     icon: "🍽" },
    see:    { label: "구경",   color: "var(--z-global)",  icon: "👀" },
    play:   { label: "체험",   color: "var(--indigo)",    icon: "🎡" },
    rest:   { label: "휴식",   color: "var(--gold)",      icon: "☕" },
    photo:  { label: "사진",   color: "var(--rose)",      icon: "📸" },
    stay:   { label: "숙소",   color: "var(--z-magic)",   icon: "🛏" }
  };
  function kindOf(k) { return KIND[k] || KIND.see; }

  /* ---------- 저장 ---------- */
  function load(id) {
    if (drafts[id]) return drafts[id];
    try {
      var raw = localStorage.getItem(KEY + id);
      if (raw) drafts[id] = JSON.parse(raw);
    } catch (e) {}
    return drafts[id] || null;
  }
  function store(id, d) {
    drafts[id] = d;
    try { localStorage.setItem(KEY + id, JSON.stringify(d)); } catch (e) {}
    var db = C.caps.db;
    if (db) db.doc("trips/" + id + "/draft").set(d).catch(function () {});
  }

  /* ---------- 일정 만들기 ---------- */
  var ASK =
    "너는 가족 여행 일정을 짜는 설계자다. 아래 조건으로 하루 일정을 만든다.\n"
    + "· 실제로 그 지역에 있는 장소만 쓴다. 확실하지 않으면 '시내 중심가'처럼 넓게 적는다.\n"
    + "· 7~10개 항목. 아침 출발부터 저녁 마무리까지 시간 순서대로.\n"
    + "· 이동 시간과 식사를 반드시 넣고, 인원과 테마에 맞춘다.\n"
    + "· kind는 move(이동) food(식사) see(구경) play(체험) rest(휴식) photo(사진) stay(숙소) 중 하나.\n"
    + "· note는 왜 이 순서인지 또는 주의할 점을 한 문장으로.\n"
    + "JSON만 답한다: {\"items\":[{\"time\":\"09:30\",\"name\":\"...\",\"kind\":\"move\",\"minutes\":60,\"note\":\"...\"}],"
    + "\"tips\":[\"한 문장\",\"한 문장\"]}\n\n여행 조건: ";

  function brief(t) {
    return JSON.stringify({
      이름: t.title, 날짜: t.date, 마지막날: t.end || t.date,
      장소: t.place || "미정", 인원: t.people || 1, 테마: t.theme || "자유"
    });
  }

  /* 모델이 없을 때의 뼈대 — 테마에 따라 흐름만 다르게 */
  var SHAPE = {
    "맛집": [["09:30", "출발", "move", 60], ["11:00", "첫 끼 — 지역 대표 음식", "food", 70],
             ["12:30", "동네 한 바퀴 산책", "see", 60], ["14:00", "카페에서 쉬기", "rest", 60],
             ["15:30", "시장 구경 · 주전부리", "food", 70], ["17:30", "저녁 자리", "food", 90],
             ["19:30", "돌아가기", "move", 60]],
    "자연": [["08:30", "출발", "move", 90], ["10:30", "둘레길 · 전망 포인트", "see", 90],
             ["12:30", "점심", "food", 60], ["14:00", "물가 · 숲길에서 쉬기", "rest", 90],
             ["16:00", "사진 포인트", "photo", 40], ["17:30", "저녁", "food", 70],
             ["19:00", "돌아가기", "move", 90]],
    "체험": [["09:00", "출발", "move", 60], ["10:30", "체험 프로그램 1", "play", 90],
             ["12:30", "점심", "food", 60], ["14:00", "체험 프로그램 2", "play", 90],
             ["16:00", "간식 · 휴식", "rest", 50], ["17:30", "저녁", "food", 80],
             ["19:30", "돌아가기", "move", 60]],
    "휴식": [["10:00", "느긋하게 출발", "move", 70], ["11:30", "숙소 체크인 · 짐 풀기", "stay", 50],
             ["12:30", "점심", "food", 70], ["14:30", "낮잠 · 책 읽기", "rest", 120],
             ["16:30", "근처 산책", "see", 60], ["18:00", "저녁", "food", 90],
             ["20:00", "야경 보기", "photo", 50]]
  };
  /* 화면의 테마 선택지 → 뼈대 */
  var THEME = {
    "가족": "체험", "아이와": "체험", "액티비티": "체험",
    "커플": "맛집", "친구": "맛집",
    "혼자": "자연", "휴양": "휴식"
  };
  function skeleton(t) {
    var key = THEME[t.theme] || "체험";
    var place = t.place || "목적지";
    return {
      items: SHAPE[key].map(function (r) {
        return { time: r[0], name: r[1] === "출발" ? place + "로 출발" : r[1], kind: r[2], minutes: r[3],
                 note: "" };
      }),
      tips: ["모델 없이 뼈대만 짠 일정입니다. 장소 이름을 채워 넣어 쓰세요.",
             (t.people || 1) + "명 기준으로 식사와 쉬는 시간을 넉넉히 뒀습니다."],
      madeAt: new Date().toISOString(), rough: true
    };
  }

  function design(t) {
    var sample = C.caps.sample;
    if (!sample || !sample.json) {
      var sk = skeleton(t);
      store(t.id, sk);
      if (current && current.id === t.id) render(t.id);
      return Promise.resolve(sk);
    }
    return sample.json([{ role: "user", content: ASK + brief(t) }], { modelTier: "default" })
      .then(function (r) {
        var items = (r && Array.isArray(r.items)) ? r.items.filter(function (x) { return x && x.name && x.time; }) : [];
        if (!items.length) throw new Error("empty");
        var d = { items: items, tips: (r && r.tips) || [], madeAt: new Date().toISOString() };
        store(t.id, d);
        if (current && current.id === t.id) render(t.id);
        return d;
      })
      .catch(function () {
        var sk = skeleton(t);
        store(t.id, sk);
        if (current && current.id === t.id) render(t.id);
        return sk;
      });
  }

  /* ---------- 그리기 ---------- */
  function box() { return document.getElementById("planDraft"); }
  function render(id) {
    var el = box();
    if (!el) return;
    var d = load(id);
    if (!d || !d.items || !d.items.length) {
      el.innerHTML = '<div class="empty"><img class="catpic" src="cat-plan.jpg" alt="" loading="lazy">'
        + "<p>아직 일정이 없어요.<br>아래 버튼을 누르면 설계 에이전트가 하루를 짜 드립니다.</p>"
        + '<button class="btn" id="draftMake">일정 짜 줘</button></div>';
      return;
    }
    var rows = d.items.map(function (it, i) {
      var k = kindOf(it.kind);
      return '<div class="ditem" style="--dc:' + k.color + '">'
        + '<span class="dtime">' + C.esc(it.time) + "</span>"
        + '<span class="dno">' + (i + 1) + "</span>"
        + '<span class="dmain"><b>' + C.esc(it.name) + "</b>"
        + '<span class="dtag">' + k.icon + " " + k.label + (it.minutes ? " · " + it.minutes + "분" : "") + "</span>"
        + (it.note ? '<span class="dnote">' + C.esc(it.note) + "</span>" : "")
        + "</span></div>";
    }).join("");
    el.innerHTML =
      '<div class="sec-head"><h2>설계 에이전트가 짠 하루</h2>'
      + "<p>" + (d.rough ? "모델 없이 뼈대만 짠 초안입니다." : "장소 · 인원 · 테마를 보고 만든 초안입니다.")
      + " 마음에 안 들면 다시 짤 수 있어요.</p></div>"
      + '<div class="draftlist">' + rows + "</div>"
      + (d.tips && d.tips.length
          ? '<ul class="dtips">' + d.tips.map(function (x) { return "<li>" + C.esc(x) + "</li>"; }).join("") + "</ul>"
          : "")
      + '<div class="nav-acts"><button class="btn" id="draftMake">다시 짜 줘</button></div>';
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest("#draftMake")) return;
    if (!current) return;
    var el = box();
    el.innerHTML = '<div class="empty"><img class="catpic" src="cat-plan.jpg" alt="" loading="lazy">'
      + "<p>설계 에이전트가 하루를 짜는 중…</p></div>";
    design(current).then(function () { render(current.id); });
  });

  /* ---------- 어느 여행을 보고 있는지 ---------- */
  C.on("trip:open", function (t) {
    current = t;
    var el = box();
    if (!el) return;
    var mapped = !!(C.regionKey && C.regionKey());   /* 지도 데이터가 있는 지역이면 그쪽이 맡는다 */
    el.hidden = mapped;
    if (!mapped) render(t.id);
  });

  /* ---------- 등록 ---------- */
  C.register({
    id: "designer", name: "설계",
    persona: "너는 새 여행의 하루 일정을 짜는 설계자다. 장소·날짜·인원·테마를 보고 "
      + "이동과 식사를 포함한 시간표를 만든다. 확실하지 않은 장소 이름은 지어내지 않고 넓게 적는다. "
      + "일정을 만들면 몇 개 항목으로 몇 시에 끝나는지 숫자로 말한다.",
    fallback: function () {
      var d = current ? load(current.id) : null;
      return d ? { items: d.items.length, ends_at: d.items[d.items.length - 1].time, tips: d.tips }
               : { items: 0, message: "아직 짠 일정이 없습니다." };
    },
    api: { design: design, render: render, get: load },
    tools: [
      { name: "draft", description: "지금 열려 있는 여행의 설계 일정을 돌려준다.",
        execute: function () {
          var d = current ? load(current.id) : null;
          if (!d) return { items: [], message: "아직 짠 일정이 없습니다." };
          return { count: d.items.length, starts_at: d.items[0].time,
                   ends_at: d.items[d.items.length - 1].time,
                   items: d.items.map(function (x, i) { return { no: i + 1, time: x.time, name: x.name, kind: x.kind }; }) };
        } },
      { name: "remake", description: "지금 여행의 하루 일정을 처음부터 다시 짠다.",
        execute: function () {
          if (!current) return { ok: false, message: "열려 있는 여행이 없습니다." };
          design(current);
          return { ok: true, message: "다시 짜는 중입니다. 일정 탭에 곧 나타납니다." };
        } }
    ]
  });

  window.DesignAgent = { design: design, render: render, get: load };
})();
