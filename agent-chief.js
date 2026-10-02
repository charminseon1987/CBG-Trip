/* ============================================================
   총괄 에이전트 — 스스로 일하지 않는다. 맡길 곳을 정하고 결과를 모은다.
   1) 어느 에이전트의 일인지 분류  2) 그 에이전트에게 위임  3) 답을 모아 보여준다
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core;
  var FUR = { chief: "var(--indigo)", plan: "var(--z-global)", album: "var(--z-zoo)", ledger: "var(--gold)", designer: "var(--z-magic)" };
  var logEl = document.getElementById("chatLog"),
      barEl = document.getElementById("askBar"),
      inEl = document.getElementById("askIn"),
      panelEl = document.getElementById("chiefPanel"),
      wrapEl = document.getElementById("askWrap"),
      backEl = document.getElementById("askBack"),
      capEl = document.getElementById("chatCap");

  function bubble(who, html, cls, agentId) {
    var d = document.createElement("div");
    d.className = "msg " + who + (cls ? " " + cls : "");
    if (who === "bot") d.innerHTML = '<span class="msgcat">' + C.catPic(agentId || "chief", { size: 30 }) + "</span><span class=\"msgtxt\">" + html + "</span>";
    else d.innerHTML = html;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }
  function put(d, html) {
    (d.querySelector(".msgtxt") || d).innerHTML = html;
    logEl.scrollTop = logEl.scrollHeight;
  }
  function hand(id, state) {
    var a = C.agents[id];
    return '<div class="handoff"><span class="ha">총괄</span><span class="har">→</span>'
      + '<span class="ha on">' + C.esc(a ? a.name : id) + "</span>"
      + (state ? " " + C.esc(state) : " 에이전트에게 맡기는 중…") + "</div>";
  }
  function dump(o) { return '<pre class="dump">' + C.esc(JSON.stringify(o, null, 1)) + "</pre>"; }

  /* ---------- 총괄의 성격 ---------- */
  var PERSONA =
    "너는 가족 여행 앱의 총괄 에이전트 '총괄 냥이'다. "
    + "직접 일하지 않고 일정·앨범·회계 에이전트에게 맡긴 뒤, 그 보고를 사용자에게 대신 전한다. "
    + "한국어로 두세 문장 안에, 친근하지만 담백하게 답한다. "
    + "숫자는 보고에 있는 값만 그대로 쓰고 절대 지어내지 않는다. 보고에 없는 건 모른다고 말한다. "
    + "일정이 바뀌는 제안은 화면에 확인 창이 뜬다는 점을 한마디로 덧붙인다. "
    + "보고가 없으면 이 앱으로 무엇을 할 수 있는지 한 문장으로 안내한다. 인사에는 짧게 인사로 답한다.";

  /* 총괄이 늘 알고 있는 오늘의 사실 */
  function facts() {
    var pl = tool("plan_list"), al = tool("album_summary"), le = tool("ledger_summary");
    var t = (window.Shell && window.Shell.current) ? window.Shell.current() : null;
    return {
      여행: t ? { 이름: t.title, 날짜: t.date, 장소: t.place, 인원: t.people } : null,
      일정: pl ? { 곳: pl.items.length, 걷는거리_km: pl.total_km, 종료: pl.ends_at } : null,
      사진: al ? { 장수: al.total, 메모: al.captioned } : null,
      지출: le ? { 총액: le.total, 건수: le.count, "1인": le.per_person } : null
    };
  }

  /* ---------- 1) 어디에 맡길지 고른다 ---------- */
  var CLASSIFY =
    "아래 요청을 처리할 에이전트를 고른다. 선택지는 plan(에버랜드 당일 경로·길안내), designer(새 여행의 하루 일정 설계·추천), "
    + "album(사진·앨범), ledger(지출·가계부)다. "
    + "인사·잡담·앱 사용법처럼 세 곳 다 필요 없으면 agents를 빈 배열로 둔다. 여러 곳이 필요하면 여럿 고른다. "
    + "JSON만 답한다: {\"agents\":[\"plan\"],\"why\":\"한 문장\"}\n\n요청: ";

  function keywordRoute(q) {
    var m = q.replace(/\s/g, ""), out = [];
    if (/원|돈|지출|가계부|비용|얼마|샀|결제|예산/.test(m)) out.push("ledger");
    if (/사진|앨범|찍|캡션/.test(m)) out.push("album");
    if (/짜줘|짜|추천|설계|코스|하루일정|다시짜/.test(m) && C.agents.designer) out.push("designer");
    if (!out.length && /일정|동선|경로|다음|어디|빼|넣|추가|최적|거리|분|시간|타|놀이기구|공연/.test(m)) out.push("plan");
    if (out.length) return out;
    if (/안녕|하이|고마|반가|누구|뭐해|뭘할|할수있|도와|사용법|어떻게/.test(m)) return [];
    return ["plan"];
  }
  function classify(q) {
    var sample = C.caps.sample;
    if (!sample || !sample.json) return Promise.resolve({ agents: keywordRoute(q), why: "규칙으로 분류" });
    return sample.json([{ role: "user", content: CLASSIFY + q }], { modelTier: "quick", cache: true })
      .then(function (r) {
        var ids = ((r && r.agents) || []).filter(function (x) { return C.agents[x]; });
        var why = (r && r.why) || "";
        if (r && Array.isArray(r.agents) && !r.agents.length) return { agents: [], why: why || "총괄이 바로 답합니다" };
        return { agents: ids.length ? ids : keywordRoute(q), why: why };
      })
      .catch(function () { return { agents: keywordRoute(q), why: "규칙으로 분류" }; });
  }

  /* ---------- 2) 보고를 사람 말로 옮긴다 (모델 없이도) ---------- */
  function sayOf(r) {
    if (r.text) return C.esc(r.text).replace(/\n/g, "<br>");
    var d = r.data;
    if (!d) return C.esc(r.name) + " 에이전트가 답을 주지 못했어요.";
    if (d.message && d.ok === false) return C.esc(d.message);

    if (r.id === "plan") {
      if (d.items) return "오늘 일정은 <b>" + d.items.length + "곳</b>, 걷는 거리 <b>" + d.total_km + "km</b>, "
        + d.ends_at + "에 끝나요.";
      if (d.done) return C.esc(d.message);
      if (d.name && d.at) return "다음은 <b>" + C.esc(C.shortName(d.name)) + "</b> — " + d.at + " 도착 예정, "
        + d.meters + "m 걸어서 약 " + d.walk_min + "분이에요.";
      if (d.ok && d.delta_m != null && !d.name) return "순서를 다시 짜서 걷는 거리를 <b>"
        + Math.abs(d.delta_m) + "m</b> 줄였어요 (약 " + Math.abs(d.delta_walk_min) + "분).";
      if (d.ok && d.name) return C.esc(C.shortName(d.name)) + " 변경안을 만들었어요 — 걷는 거리 "
        + C.signed(d.delta_m, "m") + ", 시간 " + C.signed(d.delta_walk_min, "분")
        + ". 화면의 확인 창에서 적용하시면 됩니다.";
    }
    if (r.id === "designer") {
      if (d.count) return "하루 일정 <b>" + d.count + "개</b>를 짰어요 — " + C.esc(d.starts_at)
        + " 시작, " + C.esc(d.ends_at) + " 마무리예요. 일정 탭에서 볼 수 있어요.";
      if (d.ok) return C.esc(d.message);
      if (d.message) return C.esc(d.message);
    }
    if (r.id === "album") {
      if (d.total === 0) return "아직 사진이 한 장도 없어요. 앨범 탭에서 그날 사진을 고르면 시각별로 자동 분류됩니다.";
      if (d.total != null) return "사진은 <b>" + d.total + "장</b>, 그중 " + (d.captioned || 0) + "장에 메모가 있어요.";
      if (d.missing) return "메모가 비어 있는 사진이 " + d.missing.length + "장 있어요.";
    }
    if (r.id === "ledger") {
      if (d.total != null && d.count != null) {
        if (!d.count) return "아직 기록된 지출이 없어요. 가계부 탭에서 금액과 분류를 넣으면 그 시각 장소까지 함께 저장됩니다.";
        var by = Object.keys(d.by_category || {}).map(function (k) { return k + " " + C.won(d.by_category[k]); });
        return "오늘 <b>" + C.won(d.total) + "</b> 썼어요 (" + d.count + "건, 1인 " + C.won(d.per_person) + ")."
          + (by.length ? "<br>" + C.esc(by.join(" · ")) : "");
      }
      if (d.ok && d.amount != null) return C.won(d.amount) + " 기록했어요.";
    }
    return dump(d);
  }
  function offline(results) {
    if (!results.length) return "지금은 모델 없이 도구만 쓰는 중이에요. 그래도 일정·사진·지출은 바로 확인해 드려요 — "
      + "“다음 어디로?”, “오늘 쓴 돈”, “사진 몇 장?” 처럼 물어보세요.";
    return results.map(sayOf).join("<br><br>");
  }

  /* ---------- 3) 총괄이 직접 답한다 ---------- */
  function speak(q, results, box) {
    var sample = C.caps.sample;
    if (!sample) { put(box, offline(results)); return Promise.resolve(); }
    var report = results.length
      ? results.map(function (r) {
          return "· " + r.name + " 에이전트: " + (r.text || JSON.stringify(r.data) || "(응답 없음)");
        }).join("\n")
      : "(맡긴 곳 없음 — 네가 바로 답한다)";
    var msg = PERSONA
      + "\n\n[오늘 여행 상황]\n" + JSON.stringify(facts())
      + "\n\n[에이전트 보고]\n" + report
      + "\n\n[사용자 질문]\n" + q
      + "\n\n이제 사용자에게 건넬 답만 쓴다. 머리말이나 따옴표 없이.";
    put(box, '<span class="dim">정리하는 중…</span>');
    return sample([{ role: "user", content: msg }], {
      modelTier: "quick",
      onText: function (e) { put(box, C.esc(e.text).replace(/\n/g, "<br>")); }
    }).then(function (r) {
      var t = (r && r.text) || "";
      put(box, t ? C.esc(t).replace(/\n/g, "<br>") : offline(results));
    }).catch(function () { put(box, offline(results)); });
  }

  /* ---------- 4) 받고 → 맡기고 → 답한다 ---------- */
  function ask(q) {
    openPanel(false);
    bubble("me", C.esc(q));
    var think = bubble("sys", '<span class="dim">어디에 맡길지 고르는 중…</span>');

    return classify(q).then(function (route) {
      if (!route.agents.length) {
        think.remove();
        return speak(q, [], bubble("bot", ""));
      }
      put(think, '<span class="dim">' + C.esc(route.why || "맡길 곳을 정했어요") + "</span>");

      var results = [], chain = Promise.resolve();
      route.agents.forEach(function (id) {
        chain = chain.then(function () {
          var a = C.agents[id];
          var line = bubble("sys", hand(id));
          return C.delegate(id, q).then(function (r) {
            results.push({ id: id, name: (a ? a.name : id), text: r.text, data: r.data });
            line.innerHTML = hand(id, r.text || r.data ? "보고 완료" : "응답 없음");
            renderCards();
          });
        });
      });
      return chain.then(function () { return speak(q, results, bubble("bot", "")); });
    });
  }

  /* ---------- 창: 오른쪽 아래 냥이 버튼으로 연다 ---------- */
  var fabEl = document.getElementById("chiefFab");
  function openPanel(focus) {
    if (!wrapEl.hidden) { if (focus !== false) inEl.focus(); return; }
    wrapEl.hidden = false;
    panelEl.hidden = false;
    fabEl.hidden = true;
    backEl.hidden = false;
    logEl.scrollTop = logEl.scrollHeight;
    if (focus !== false) inEl.focus();
  }
  function closePanel() {
    wrapEl.hidden = true;
    panelEl.hidden = true;
    fabEl.hidden = false;
    backEl.hidden = true;
  }
  fabEl.addEventListener("click", function () { openPanel(); });

  var bigBar = document.getElementById("askBarBig"), bigIn = document.getElementById("askInBig");
  bigBar.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = bigIn.value.trim();
    openPanel(false);
    if (!q) return;
    bigIn.value = "";
    ask(q);
  });
  document.getElementById("homeChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-q]");
    if (b) { openPanel(false); ask(b.getAttribute("data-q")); }
  });
  barEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = inEl.value.trim();
    openPanel(false);
    if (!q) return;
    inEl.value = "";
    ask(q);
  });
  document.getElementById("askClose").addEventListener("click", function () { closePanel(); inEl.blur(); });
  document.getElementById("chatChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-q]");
    if (b) { openPanel(false); ask(b.getAttribute("data-q")); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panelEl.hidden) { closePanel(); inEl.blur(); }
  });
  backEl.addEventListener("click", function () { closePanel(); inEl.blur(); });
  C.on("plan:changed", function () { closePanel(); });

  /* ---------- 메인: 요약 카드 ---------- */
  function tool(name, args) {
    var t = C.tools().filter(function (x) { return x.name === name; })[0];
    try { return t ? t.execute(args || {}) : null; } catch (e) { return null; }
  }
  function card(tab, label, value, sub) {
    return '<button class="hcard" data-go="' + tab + '"><span class="hl">' + label + "</span>"
      + '<span class="hv">' + value + '</span><span class="hs">' + C.esc(sub) + "</span></button>";
  }
  function renderCards() {
    var el = document.getElementById("homeCards");
    if (!el || document.getElementById("tab-home").hidden) return;
    var pl = tool("plan_list"), al = tool("album_summary"), le = tool("ledger_summary");
    el.innerHTML =
      (pl ? card("plan", "일정", pl.items.length + "개", pl.total_km + " km · " + pl.ends_at + " 종료") : "")
      + (al ? card("album", "사진", al.total + "장", al.captioned + "장에 메모") : "")
      + (le ? card("ledger", "지출", C.won(le.total), le.count + "건 · 1인 " + C.won(le.per_person)) : "");
  }
  document.getElementById("homeCards").addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]");
    if (b && window.Shell) window.Shell.tab(b.getAttribute("data-go"));
  });

  /* ---------- 메인: 에이전트 명부 ---------- */
  function ago(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return s + "초 전";
    if (s < 3600) return Math.round(s / 60) + "분 전";
    return Math.round(s / 3600) + "시간 전";
  }
  function renderRoster() {
    var el = document.getElementById("agentRoster");
    if (!el) return;
    var acts = C.activity();
    var rows = C.list().map(function (a) {
      var last = acts.filter(function (x) { return x.agent === a.id; })[0];
      return '<div class="arow' + (a.busy ? " busy" : "") + '">'
        + C.catPic(a.id)
        + '<span class="an">' + C.esc(a.name) + "</span>"
        + '<span class="at">도구 ' + ((a.tools || []).length) + "개</span>"
        + '<span class="al">' + (last ? C.esc(last.tool) + " · " + ago(last.at) : "대기 중") + "</span></div>";
    }).join("");
    el.innerHTML = '<div class="arow head">' + C.catPic("chief") + '<span class="an">총괄</span>'
      + '<span class="at">분류 · 위임</span><span class="al">' + (C.caps.sample ? "모델 연결됨" : "규칙 모드") + "</span></div>" + rows;
  }

  C.on("tab", function (id) { if (id === "home") { renderCards(); renderRoster(); } });
  C.on("plan:rendered", renderCards);
  C.on("activity", renderRoster);
  C.on("trip:open", function () { setTimeout(function () { renderCards(); renderRoster(); }, 60); });

  C.on("cap:sample", function (s) {
    capEl.textContent = s ? "에이전트 " + C.list().length + "명 대기" : "모델 없이 도구만";
    capEl.className = "chatcap " + (s ? "on" : "");
    renderRoster();
  });
  C.on("agents", function (a) {
    var el = document.getElementById("chatAgents");
    if (el) el.innerHTML = Object.keys(a).map(function (k) {
      return '<span class="abadge' + (a[k].busy ? " busy" : "") + '">' + C.esc(a[k].name) + "</span>";
    }).join("");
    renderRoster();
  });

  /* ---------- 새 여행이 생기면: 총괄 → 설계 에이전트 ---------- */
  C.on("trip:new", function (t) {
    var a = C.agents.designer;
    if (!a || !a.api) return;
    if (C.regionKey && C.regionKey()) {        /* 지도 데이터가 있는 지역 — 바로 경로 일정이 뜬다 */
      openPanel(false);
      var d = C.D;
      bubble("bot", "<b>" + C.esc(t.place || t.title) + "</b>는 지도 데이터가 있어요. "
        + "관광지 " + d.pool.length + "곳 중 꼭 가 볼 곳으로 하루 경로를 이미 깔아 뒀습니다."
        + "<br>일정 탭에서 지도와 함께 보여 드릴게요.");
      if (window.Shell) window.Shell.tab("plan");
      renderCards();
      return;
    }
    openPanel(false);
    bubble("bot", "<b>" + C.esc(t.title) + "</b> 좋네요. 하루 일정은 설계 에이전트에게 맡길게요.");
    var line = bubble("sys", hand("designer"));
    var box = bubble("bot", '<span class="dim">' + C.esc(t.place || "목적지")
      + " · " + (t.people || 1) + "명 · " + C.esc(t.theme || "자유") + " 로 하루를 짜는 중…</span>", "", "designer");

    a.api.design(t).then(function (d) {
      line.innerHTML = hand("designer", "보고 완료");
      var n = d.items.length, ends = d.items[n - 1].time;
      put(box, "일정 <b>" + n + "개</b>를 짰어요 — " + C.esc(d.items[0].time) + " 시작, "
        + C.esc(ends) + " 마무리예요." + (d.rough ? " (모델 없이 뼈대만 잡은 초안이에요)" : "")
        + "<br>일정 탭에서 보여 드릴게요.");
      if (window.Shell) window.Shell.tab("plan");
      renderCards();
    }).catch(function () {
      put(box, "일정을 짜지 못했어요. 일정 탭에서 <b>일정 짜 줘</b>를 눌러 다시 시도해 주세요.");
    });
  });

  window.Chief = { ask: ask, open: openPanel, close: closePanel };
})();
