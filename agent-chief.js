/* ============================================================
   총괄 에이전트 — 사용자의 말을 받아 알맞은 에이전트에게 넘긴다
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core;
  var logEl = document.getElementById("chatLog"),
      formEl = document.getElementById("chatForm"),
      inEl = document.getElementById("chatIn"),
      capEl = document.getElementById("chatCap");

  var history = [];

  function bubble(who, html, cls) {
    var d = document.createElement("div");
    d.className = "msg " + who + (cls ? " " + cls : "");
    d.innerHTML = html;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }

  function toolLine(name) {
    var a = name.split("_")[0];
    var label = (C.agents[a] && C.agents[a].name) || a;
    return '<span class="tool">' + C.esc(label) + " 에이전트 호출</span>";
  }

  var SYSTEM =
    "너는 가족 여행 앱의 총괄 에이전트다. 세 명의 전문 에이전트를 지휘한다: " +
    "일정(경로 계산·재탐색·길안내), 앨범(사진), 회계(지출). " +
    "사용자의 말에 맞는 도구를 골라 호출하고, 결과를 한국어 두세 문장으로 간결히 답하라. " +
    "숫자는 그대로 인용하고 지어내지 마라. 일정을 바꾸는 도구는 사용자가 확인 창에서 결정하므로, " +
    "needs_confirm이 참이면 '확인 창을 띄웠다'고 알려라. 도구가 없으면 모른다고 답하라.";

  /* ---------- 폴백 라우터(모델을 못 쓸 때) ---------- */
  function fallback(q) {
    var t = C.tools(), pick = null, m = q.replace(/\s/g, "");
    function call(n, args) {
      var tool = t.filter(function (x) { return x.name === n; })[0];
      return tool ? tool.execute(args || {}) : null;
    }
    if (/얼마|지출|돈|가계부|비용/.test(m)) pick = { n: "ledger_summary" };
    else if (/사진|앨범/.test(m)) pick = { n: "album_summary" };
    else if (/다음|어디로|길/.test(m)) pick = { n: "plan_next" };
    else if (/최적|줄여|짧게/.test(m)) pick = { n: "plan_optimize" };
    else pick = { n: "plan_list" };
    var r = call(pick.n);
    return { text: "모델을 쓸 수 없어 기본 결과만 보여드립니다.", data: r, used: pick.n };
  }

  function ask(q) {
    bubble("me", C.esc(q));
    var think = bubble("bot", '<span class="dim">생각 중…</span>');
    var sample = C.caps.sample;

    if (!sample) {
      var f = fallback(q);
      think.innerHTML = C.esc(f.text) + toolLine(f.used) + '<pre class="dump">' + C.esc(JSON.stringify(f.data, null, 1)) + "</pre>";
      return;
    }

    var tools = C.tools().map(function (t) {
      return {
        name: t.name, description: t.description, inputSchema: t.inputSchema,
        execute: function (input) {
          think.insertAdjacentHTML("beforeend", toolLine(t.name));
          try { return t.execute(input || {}); } catch (e) { return { error: String(e) }; }
        }
      };
    });

    history.push({ role: "user", content: q });
    var turns = [{ role: "user", content: SYSTEM + "\n\n사용자: " + q }];
    if (history.length > 1) {
      turns = history.slice(-6).map(function (h, i, arr) {
        return { role: h.role, content: (i === arr.length - 1 ? SYSTEM + "\n\n사용자: " : "") + h.content };
      });
      if (turns[turns.length - 1].role !== "user") turns.push({ role: "user", content: q });
    }

    sample(turns, {
      tools: tools,
      modelTier: "quick",
      onText: function (e) { think.textContent = e.text; }
    }).then(function (r) {
      think.innerHTML = C.esc(r.text || "").replace(/\n/g, "<br>");
      history.push({ role: "assistant", content: r.text || "" });
    }).catch(function (e) {
      var f = fallback(q);
      think.innerHTML = '<span class="dim">' + C.esc((e && e.code) === "not_granted" ? "모델 사용이 거절되었습니다." : "모델 호출에 실패했습니다.") + "</span>"
        + toolLine(f.used) + '<pre class="dump">' + C.esc(JSON.stringify(f.data, null, 1)) + "</pre>";
    });
  }

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = inEl.value.trim();
    if (!q) return;
    inEl.value = "";
    ask(q);
  });
  document.getElementById("chatChips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-q]");
    if (b) ask(b.getAttribute("data-q"));
  });

  C.on("cap:sample", function (s) {
    capEl.textContent = s ? "총괄 에이전트 준비됨" : "모델 없이 기본 답변만";
    capEl.className = "chatcap " + (s ? "on" : "");
  });
  C.on("agents", function (a) {
    document.getElementById("chatAgents").innerHTML = Object.keys(a).map(function (k) {
      return '<span class="abadge">' + C.esc(a[k].name) + "</span>";
    }).join("");
  });
})();
