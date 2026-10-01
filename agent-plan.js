/* ============================================================
   일정 에이전트 — 경로 계산 · 재탐색 · 비교 · 길안내
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core, D = C.D, POOL = C.pool, state = C.state;
  if (!D) { document.getElementById("state").textContent = "지도 데이터를 불러오지 못했습니다"; return; }

  /* ---------------- 보행로 그래프 ---------------- */
  var N = D.nodes, ADJ = [];
  for (var i = 0; i < N.length; i++) ADJ.push([]);
  D.edges.forEach(function (e) {
    var a = e[0], b = e[1], w = Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]);
    ADJ[a].push([b, w]); ADJ[b].push([a, w]);
  });
  var M_PER_PX = D.mPerPx, WALK = 70, cache = {};

  function dijkstra(from, to) {
    var key = from + ":" + to;
    if (cache[key]) return cache[key];
    var dist = new Float64Array(N.length).fill(Infinity), prev = new Int32Array(N.length).fill(-1);
    var heap = [[0, from]]; dist[from] = 0;
    function push(v) { heap.push(v); var i = heap.length - 1; while (i > 0) { var p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; var t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } }
    function pop() { var top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; var i = 0; for (;;) { var l = 2 * i + 1, r = l + 1, s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; var t = heap[s]; heap[s] = heap[i]; heap[i] = t; i = s; } } return top; }
    while (heap.length) {
      var cur = pop(), d = cur[0], u = cur[1];
      if (u === to) break;
      if (d > dist[u]) continue;
      for (var k = 0; k < ADJ[u].length; k++) {
        var v = ADJ[u][k][0], nd = d + ADJ[u][k][1];
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); }
      }
    }
    var out = { m: 0, pts: [] };
    if (dist[to] !== Infinity) {
      var path = [to], c = to;
      while (c !== from && prev[c] !== -1) { c = prev[c]; path.push(c); }
      path.reverse();
      out.m = dist[to] * M_PER_PX;
      out.pts = path.map(function (n) { return N[n]; });
    }
    cache[key] = out;
    return out;
  }
  function legBetween(a, b) { return dijkstra(POOL[a].node, POOL[b].node); }
  function legM(a, b) { return legBetween(a, b).m; }

  /* ---------------- 일정 계산 ---------------- */
  var STAY = { gate: 20, animal: 30, ride: 10, wet: 12, food: 50, lift: 8, solo: 8, show: 0 };
  function stayOf(p, sat) {
    if (p.kind === "show") return C.toMin(C.hhmm(p.close)) - C.toMin(C.hhmm(p.open));
    var base = STAY[p.kind] != null ? STAY[p.kind] : 15;
    return Math.round(base + (p.wait ? p.wait * (sat ? 1.5 : 1) : 0));
  }
  function compute(items, start, sat) {
    items = items || state.items;
    start = start || state.start;
    sat = sat === undefined ? state.sat : sat;
    var t = C.toMin(start), out = [], totalM = 0, walkMin = 0, problems = [];
    for (var i = 0; i < items.length; i++) {
      var p = POOL[items[i]], leg = null;
      if (i > 0) {
        leg = legBetween(items[i - 1], items[i]);
        var wm = Math.ceil(leg.m / WALK);
        t += wm; totalM += leg.m; walkMin += wm;
      }
      var arrive = t, fixed = null, slack = null;
      if (p.kind === "show" && p.open) {
        fixed = C.toMin(C.hhmm(p.open));
        slack = fixed - arrive;
        if (arrive < fixed) t = fixed;
      }
      var opens = p.open && p.kind !== "show" ? C.toMin(C.hhmm(p.open)) : null;
      var closes = p.close ? C.toMin(C.hhmm(p.close)) : null;
      var waitOpen = 0, problem = null;
      if (opens != null && t < opens) { waitOpen = opens - t; t = opens; }
      if (closes != null && p.kind !== "show" && t > closes) problem = "마감(" + C.hhmm(p.close) + ") 지남";
      else if (fixed != null && arrive > fixed) problem = "공연보다 " + (arrive - fixed) + "분 늦음";
      if (problem) problems.push(C.shortName(p.name) + " — " + problem);
      var stay = stayOf(p, sat);
      out.push({ id: p.id, p: p, leg: leg, at: t, stay: stay, end: t + stay, slack: slack, problem: problem, waitOpen: waitOpen });
      t += stay;
    }
    return { rows: out, totalM: totalM, walkMin: walkMin, endAt: t, problems: problems };
  }

  /* ---------------- 순서 최적화 ---------------- */
  function movable(items) {
    var idx = [];
    for (var i = 1; i < items.length; i++) if (POOL[items[i]].kind !== "show") idx.push(i);
    return idx;
  }
  function walkOf(items) {
    var m = 0;
    for (var i = 1; i < items.length; i++) m += legM(items[i - 1], items[i]);
    return m;
  }
  function optimize(items) {
    var best = items.slice(), bestM = walkOf(best), baseP = compute(best).problems.length;
    var improved = true, guard = 0;
    while (improved && guard++ < 20) {
      improved = false;
      var mv = movable(best);
      for (var a = 0; a < mv.length && !improved; a++) {
        for (var b = 0; b < mv.length && !improved; b++) {
          if (a === b) continue;
          var cand = best.slice(), it = cand.splice(mv[a], 1)[0];
          var at = mv[b] > mv[a] ? mv[b] - 1 : mv[b];
          if (at < 1) continue;
          cand.splice(at, 0, it);
          var m = walkOf(cand);
          if (m < bestM - 1 && compute(cand).problems.length <= baseP) { best = cand; bestM = m; improved = true; }
        }
      }
    }
    return { items: best, m: bestM };
  }
  function bestInsert(id, items) {
    items = items || state.items;
    var best = null;
    for (var i = 1; i <= items.length; i++) {
      var add = (i === items.length) ? legM(items[i - 1], id)
        : legM(items[i - 1], id) + legM(id, items[i]) - legM(items[i - 1], items[i]);
      if (best === null || add < best.add) best = { at: i, add: add };
    }
    return best || { at: items.length, add: 0 };
  }

  /* ---------------- 변경 검토 ---------------- */
  function diff(before, after) {
    return {
      dm: after.totalM - before.totalM,
      dwalk: after.walkMin - before.walkMin,
      dend: after.endAt - before.endAt,
      newProblems: after.problems.filter(function (x) { return before.problems.indexOf(x) === -1; }),
      fixedProblems: before.problems.filter(function (x) { return after.problems.indexOf(x) === -1; }),
      before: before, after: after
    };
  }
  function verdict(d) {
    if (d.newProblems.length) return "bad";
    if (d.dm > 150 || d.dwalk >= 4) return "bad";
    if (d.dm < -80 || d.fixedProblems.length) return "good";
    return "ok";
  }

  var pending = null;

  function propose(nextItems, label, onDone) {
    var before = compute(), after = compute(nextItems), d = diff(before, after);
    if (verdict(d) !== "bad") { commit(nextItems, label, d); if (onDone) onDone({ applied: true, d: d }); return; }
    var alt = null, opt = optimize(nextItems);
    if (opt.m < after.totalM - 60) {
      var ad = diff(before, compute(opt.items));
      if (!ad.newProblems.length) alt = { items: opt.items, label: "순서까지 함께 정리", d: ad };
    }
    pending = { items: nextItems, label: label, d: d, alt: alt, onDone: onDone };
    renderSheet();
  }
  function commit(items, label, d) {
    state.items = items;
    if (state.cursor >= items.length) state.cursor = items.length - 1;
    pending = null; renderSheet();
    C.save(); render();
    if (d) C.toast("<b>" + C.esc(label) + "</b> · 거리 " + C.signed(d.dm, " m") + " · 걷는 시간 " + C.signed(d.dwalk, "분")
      + (d.dend ? " · 끝나는 시각 " + C.signed(d.dend, "분") : "")
      + (d.fixedProblems.length ? " · 문제 " + d.fixedProblems.length + "건 해소" : ""), d.dm <= 0 ? "good" : "warn");
    C.emit("plan:changed", compute());
  }
  function diffRow(k, a, b, delta, bad) {
    return '<div class="drow"><span class="dk">' + k + '</span><span class="dv">' + a + " → <b>" + b + "</b></span>"
      + '<span class="dd ' + (bad ? "up" : "down") + '">' + delta + "</span></div>";
  }
  function renderSheet() {
    var el = document.getElementById("sheet");
    if (!pending) { el.hidden = true; el.innerHTML = ""; return; }
    var d = pending.d;
    el.innerHTML = '<div class="sheet-in">'
      + '<div class="sheet-head"><span class="rr">경로 재탐색</span><span class="sheet-title">' + C.esc(pending.label) + "</span></div>"
      + '<div class="sheet-why">바뀐 경로가 기존보다 <b>' + (d.newProblems.length ? "일정을 깨뜨립니다" : "비효율적입니다") + "</b>. 그대로 진행할까요?</div>"
      + '<div class="difftable">'
      + diffRow("걷는 거리", Math.round(d.before.totalM) + " m", Math.round(d.after.totalM) + " m", C.signed(d.dm, " m"), d.dm > 0)
      + diffRow("걷는 시간", d.before.walkMin + "분", d.after.walkMin + "분", C.signed(d.dwalk, "분"), d.dwalk > 0)
      + diffRow("끝나는 시각", C.hm(d.before.endAt), C.hm(d.after.endAt), d.dend ? C.signed(d.dend, "분") : "그대로", d.dend > 0)
      + "</div>"
      + (d.newProblems.length ? '<div class="sheet-warn"><b>새로 생기는 문제</b><ul>' + d.newProblems.map(function (x) { return "<li>" + C.esc(x) + "</li>"; }).join("") + "</ul></div>" : "")
      + (pending.alt ? '<div class="sheet-alt">더 나은 방법 — <b>' + C.esc(pending.alt.label) + "</b> (" + C.signed(pending.alt.d.dm, " m") + " · " + C.signed(pending.alt.d.dwalk, "분") + ")</div>" : "")
      + '<div class="sheet-acts"><button class="btn pri" data-sheet="go">이대로 진행</button>'
      + (pending.alt ? '<button class="btn" data-sheet="alt">더 나은 방법으로</button>' : "")
      + '<button class="btn ghost" data-sheet="cancel">취소</button></div></div>';
    el.hidden = false;
  }
  document.getElementById("sheet").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sheet]");
    if (!b || !pending) return;
    var act = b.getAttribute("data-sheet"), cb = pending.onDone;
    if (act === "go") { commit(pending.items, pending.label, pending.d); if (cb) cb({ applied: true }); }
    else if (act === "alt") { commit(pending.alt.items, pending.alt.label, pending.alt.d); if (cb) cb({ applied: true, alt: true }); }
    else { pending = null; renderSheet(); if (cb) cb({ applied: false }); }
  });

  /* ---------------- 지도 ---------------- */
  var svg = document.getElementById("map");
  svg.setAttribute("viewBox", "0 0 " + D.vw + " " + D.vh);
  var baseG = document.createElementNS("http://www.w3.org/2000/svg", "g");
  baseG.innerHTML = D.base; svg.appendChild(baseG);
  var liveG = document.createElementNS("http://www.w3.org/2000/svg", "g"); svg.appendChild(liveG);

  var PHASE = ["var(--indigo)", "var(--gold)", "var(--rose)"];
  function phaseOf(i, n) { return PHASE[i < n / 3 ? 0 : (i < (2 * n) / 3 ? 1 : 2)]; }
  var myPos = null;
  var CAND = [[20, 4, "start"], [-20, 4, "end"], [0, -20, "middle"], [0, 27, "middle"],
              [20, -15, "start"], [-20, -15, "end"], [20, 23, "start"], [-20, 23, "end"],
              [0, -34, "middle"], [0, 41, "middle"]];

  function drawMap(plan) {
    var g = "", rows = plan.rows, n = rows.length;
    rows.forEach(function (r, i) {
      if (!r.leg || !r.leg.pts.length) return;
      var d = "M " + r.leg.pts.map(function (p) { return p[0] + " " + p[1]; }).join(" L ");
      var live = (i === state.cursor + 1);
      g += '<path d="' + d + '" fill="none" stroke="var(--card)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".85"></path>';
      g += '<path d="' + d + '" fill="none" stroke="' + phaseOf(i, n) + '" stroke-width="' + (live ? 5 : 3.2) + '" stroke-linecap="round" stroke-linejoin="round"'
         + (live ? ' class="leg-live"' : ' opacity="' + (i <= state.cursor ? ".3" : ".9") + '"') + "></path>";
    });
    zoneMembers(state.zone).forEach(function (p) {
      if (state.items.indexOf(p.id) !== -1) return;
      g += '<circle cx="' + p.x + '" cy="' + p.y + '" r="6.5" fill="var(--card)" stroke="' + zoneColor(state.zone) + '" stroke-width="2.2" opacity=".9"></circle>';
    });
    var taken = rows.map(function (r) { return { x: r.p.x - 15, y: r.p.y - 15, w: 30, h: 30 }; });
    function hits(b) {
      if (b.x < 2 || b.y < 2 || b.x + b.w > D.vw - 2 || b.y + b.h > D.vh - 2) return true;
      for (var k = 0; k < taken.length; k++) {
        var t = taken[k];
        if (b.x < t.x + t.w && b.x + b.w > t.x && b.y < t.y + t.h && b.y + b.h > t.y) return true;
      }
      return false;
    }
    rows.forEach(function (r, i) {
      var p = r.p, col = phaseOf(i, n), op = i < state.cursor ? ".4" : "1";
      if (i === state.cursor) g += '<circle cx="' + p.x + '" cy="' + p.y + '" r="20" fill="none" stroke="' + col + '" stroke-width="2" opacity=".5"></circle>';
      g += '<circle cx="' + p.x + '" cy="' + p.y + '" r="12.5" fill="' + col + '" stroke="var(--card)" stroke-width="2.5" opacity="' + op + '"></circle>';
      g += '<text class="svg-badge" x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle" font-size="11.5" fill="var(--card)" opacity="' + op + '">' + (i + 1) + "</text>";
      var label = C.shortName(p.name), w = 48 + label.length * 13, pick = null;
      var order = p.x > D.vw * 0.6 ? CAND.slice().sort(function (a, b) { return (a[2] === "end" ? 0 : 1) - (b[2] === "end" ? 0 : 1); }) : CAND;
      for (var c = 0; c < order.length && !pick; c++) {
        var dx = order[c][0], dy = order[c][1], anc = order[c][2];
        var bx = anc === "start" ? p.x + dx : (anc === "end" ? p.x + dx - w : p.x - w / 2);
        var box = { x: bx, y: p.y + dy - 12, w: w, h: 16 };
        if (!hits(box)) pick = { dx: dx, dy: dy, anc: anc, box: box };
      }
      if (!pick) return;
      taken.push(pick.box);
      g += '<text x="' + (p.x + pick.dx) + '" y="' + (p.y + pick.dy) + '" text-anchor="' + pick.anc + '" font-size="12.5" paint-order="stroke" stroke="var(--card)" stroke-width="4.5" stroke-linejoin="round" opacity="' + op + '">'
         + '<tspan class="svg-lbl" fill="' + col + '">' + C.hm(r.at) + "</tspan>"
         + '<tspan class="svg-sub" fill="currentColor" dx="5">' + C.esc(label) + "</tspan></text>";
    });
    if (myPos) {
      g += '<circle cx="' + myPos.x + '" cy="' + myPos.y + '" r="15" fill="var(--green)" opacity=".2"></circle>';
      g += '<circle cx="' + myPos.x + '" cy="' + myPos.y + '" r="6" fill="var(--green)" stroke="var(--card)" stroke-width="2.5"></circle>';
    }
    liveG.innerHTML = g;
  }

  /* ---------------- 턴바이턴 ---------------- */
  function bearing(ax, ay, bx, by) { var a = Math.atan2(bx - ax, -(by - ay)) * 180 / Math.PI; return a < 0 ? a + 360 : a; }
  function steps(leg) {
    var pts = leg.pts;
    if (!pts || pts.length < 2) return [];
    var keep = [pts[0]], acc = 0;
    for (var i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * M_PER_PX;
      if (acc >= 18 || i === pts.length - 1) { keep.push(pts[i]); acc = 0; }
    }
    var out = [], run = 0;
    for (var k = 1; k < keep.length; k++) {
      run += Math.hypot(keep[k][0] - keep[k - 1][0], keep[k][1] - keep[k - 1][1]) * M_PER_PX;
      if (k === keep.length - 1) { out.push({ m: run, turn: "arrive" }); break; }
      var b1 = bearing(keep[k - 1][0], keep[k - 1][1], keep[k][0], keep[k][1]);
      var b2 = bearing(keep[k][0], keep[k][1], keep[k + 1][0], keep[k + 1][1]);
      var dA = ((b2 - b1 + 540) % 360) - 180;
      if (Math.abs(dA) >= 32 && run >= 25) {
        out.push({ m: run, turn: dA > 0 ? (dA > 95 ? "sharp-right" : "right") : (dA < -95 ? "sharp-left" : "left") });
        run = 0;
      }
    }
    return out;
  }
  var TURN = { left: "왼쪽", right: "오른쪽", "sharp-left": "크게 왼쪽", "sharp-right": "크게 오른쪽" };
  function remainingOnLeg(leg, pt) {
    var best = { d: Infinity, idx: 1, t: 0 };
    for (var i = 1; i < leg.pts.length; i++) {
      var a = leg.pts[i - 1], b = leg.pts[i], vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
      var t = L ? Math.max(0, Math.min(1, ((pt.x - a[0]) * vx + (pt.y - a[1]) * vy) / L)) : 0;
      var d = Math.hypot(pt.x - (a[0] + vx * t), pt.y - (a[1] + vy * t));
      if (d < best.d) best = { d: d, idx: i, t: t };
    }
    var rem = Math.hypot(leg.pts[best.idx][0] - leg.pts[best.idx - 1][0], leg.pts[best.idx][1] - leg.pts[best.idx - 1][1]) * (1 - best.t);
    for (var j = best.idx + 1; j < leg.pts.length; j++) rem += Math.hypot(leg.pts[j][0] - leg.pts[j - 1][0], leg.pts[j][1] - leg.pts[j - 1][1]);
    return { m: rem * M_PER_PX, off: best.d * M_PER_PX };
  }
  function nearestNode(pt) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < N.length; i++) {
      var d = (N[i][0] - pt.x) * (N[i][0] - pt.x) + (N[i][1] - pt.y) * (N[i][1] - pt.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---------------- 구역 ---------------- */
  var ZONES = [
    { id: "06", name: "주토피아", color: "var(--z-zoo)" },
    { id: "05", name: "유러피언", color: "var(--z-euro)" },
    { id: "03", name: "매직랜드", color: "var(--z-magic)" },
    { id: "02", name: "아메리칸", color: "var(--z-amer)" },
    { id: "01", name: "글로벌페어", color: "var(--z-global)" },
    { id: "show", name: "공연", color: "var(--gold)" }
  ];
  function zoneColor(id) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i].color; return "var(--muted)"; }
  function zoneMembers(id) {
    return D.pool.filter(function (p) { return id === "show" ? p.kind === "show" : (p.zone === id && p.kind !== "show"); });
  }
  function heightTag(p) { return !p.hmin ? null : (p.hmax ? "키 " + p.hmin + "–" + p.hmax + "cm" : "키 " + p.hmin + "cm~"); }

  function renderZones() {
    var items = state.items;
    document.getElementById("zones").innerHTML = ZONES.map(function (z) {
      var all = zoneMembers(z.id), inn = all.filter(function (p) { return items.indexOf(p.id) !== -1; }).length;
      return '<button class="zbtn" data-zone="' + z.id + '" aria-pressed="' + (state.zone === z.id) + '">'
        + '<span class="sw" style="background:' + z.color + '"></span>' + C.esc(z.name)
        + '<span class="cnt">' + inn + " / " + all.length + "</span></button>";
    }).join("");
    var list = zoneMembers(state.zone);
    var inPlan = list.filter(function (p) { return items.indexOf(p.id) !== -1; });
    var out = list.filter(function (p) { return items.indexOf(p.id) === -1; });
    function row(p, inside) {
      var ord = items.indexOf(p.id), b = inside ? null : bestInsert(p.id);
      return '<div class="zrow' + (inside ? " in" : "") + '">'
        + '<span class="nm">' + (inside ? '<span class="ord">' + (ord + 1) + "</span>" : "") + C.esc(p.name) + "</span>"
        + (inside ? '<button class="btn sm out" data-remove="' + p.id + '">빼기</button>'
                  : '<button class="btn sm" data-insert="' + p.id + '">넣기</button>')
        + '<span class="meta">' + (p.open ? C.hhmm(p.open) + "–" + C.hhmm(p.close) : "시간 제한 없음")
        + (p.wait ? " · 대기 " + p.wait + "분" : "")
        + (heightTag(p) ? ' · <span class="hl">' + heightTag(p) + "</span>" : "")
        + (inside ? "" : " · 넣으면 " + (b.add > 0 ? "+" + Math.round(b.add) + " m" : "거리 변화 없음"))
        + "</span></div>";
    }
    var html = "";
    if (inPlan.length) html += '<div class="zgroup">일정에 있음 ' + inPlan.length + "</div>" + inPlan.map(function (p) { return row(p, true); }).join("");
    if (out.length) html += '<div class="zgroup">일정에 없음 ' + out.length + "</div>" + out.map(function (p) { return row(p, false); }).join("");
    document.getElementById("zoneitems").innerHTML = html || '<p class="dim">이 구역에는 후보가 없습니다.</p>';
  }

  /* ---------------- 렌더 ---------------- */
  var planEl = document.getElementById("plan"), factsEl = document.getElementById("facts"), suggestEl = document.getElementById("suggest");
  function fact(k, v) { return '<div class="fact"><dt>' + k + "</dt><dd>" + v + "</dd></div>"; }

  function render() {
    var plan = compute();
    if (state.cursor > plan.rows.length - 1) state.cursor = plan.rows.length - 1;
    factsEl.innerHTML = fact("일정", plan.rows.length + "개") + fact("걷는 거리", (plan.totalM / 1000).toFixed(1) + " km")
      + fact("걷는 시간", plan.walkMin + "분") + fact("끝나는 시각", C.hm(plan.endAt));

    var opt = optimize(state.items);
    if (opt.m < plan.totalM - 150) {
      var od = diff(plan, compute(opt.items));
      suggestEl.hidden = false;
      suggestEl.innerHTML = '<div class="sg-in"><div><b>순서를 바꾸면 ' + C.signed(od.dm, " m") + " · " + C.signed(od.dwalk, "분") + "</b>"
        + '<div class="sg-sub">' + C.esc(opt.items.slice(0, 6).map(function (x) { return C.shortName(POOL[x].name); }).join(" → ")) + " → …</div></div>"
        + '<button class="btn sm" id="takeopt">이 순서로</button></div>';
    } else { suggestEl.hidden = true; suggestEl.innerHTML = ""; }

    var h = "";
    plan.rows.forEach(function (r, i) {
      if (r.leg) h += '<div class="walk"><span class="bar"></span>도보 ' + Math.round(r.leg.m) + " m · " + Math.ceil(r.leg.m / WALK) + "분</div>";
      var p = r.p;
      h += '<div class="item' + (i === state.cursor ? " cur" : "") + (i < state.cursor ? " done" : "") + '" data-i="' + i + '">'
        + '<div class="when"><span class="t">' + C.hm(r.at) + '</span><span class="n">' + (i + 1) + "</span></div>"
        + "<div><h3>" + C.esc(p.name) + '</h3><div class="tags">'
        + '<span class="tag t-' + p.zone + '">' + C.esc(p.zl) + "</span>"
        + (heightTag(p) ? '<span class="tag plain">' + heightTag(p) + "</span>" : "")
        + (p.wait ? '<span class="tag plain">대기 ' + Math.round(p.wait * (state.sat ? 1.5 : 1)) + "분</span>" : "")
        + '<span class="tag plain">머무는 시간 ' + r.stay + "분</span>"
        + (r.slack != null && r.slack > 0 ? '<span class="tag plain">' + r.slack + "분 여유</span>" : "")
        + (r.waitOpen ? '<span class="tag plain">개장까지 ' + r.waitOpen + "분</span>" : "")
        + (r.problem ? '<span class="tag warnt">' + C.esc(r.problem) + "</span>" : "")
        + '</div><p class="note">' + C.esc(p.note) + "</p></div>"
        + '<div class="ctl">'
        + '<button class="icb" data-act="up" data-i="' + i + '" aria-label="위로" ' + (i === 0 ? "disabled" : "") + ">&#9650;</button>"
        + '<button class="icb" data-act="down" data-i="' + i + '" aria-label="아래로" ' + (i === plan.rows.length - 1 ? "disabled" : "") + ">&#9660;</button>"
        + '<button class="icb del" data-act="del" data-i="' + i + '" aria-label="빼기">&#10005;</button></div></div>';
    });
    planEl.innerHTML = h;
    renderZones();
    drawMap(plan);
    drawNav(plan);
    C.emit("plan:rendered", plan);
  }

  /* ---------------- 내비게이션 ---------------- */
  var COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  function drawNav(plan) {
    var rows = plan.rows, i = state.cursor, cur = rows[i], nxt = rows[i + 1];
    var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
    document.getElementById("clock").textContent = C.hm(nowMin);
    document.getElementById("prog").textContent = (i + 1) + " / " + rows.length;
    var isDay = now.getFullYear() === 2026 && now.getMonth() === 9 && now.getDate() === 3;
    document.getElementById("state").textContent = isDay
      ? (nowMin < cur.at ? "예정보다 이릅니다" : (nowMin > cur.end ? "예정보다 " + (nowMin - cur.end) + "분 늦었습니다" : "일정대로입니다"))
      : "10월 3일이 아닙니다 — 계획 보기";

    var dirEl = document.getElementById("dir"), toEl = document.getElementById("to"), metaEl = document.getElementById("meta"),
        noteEl = document.getElementById("note"), stepEl = document.getElementById("steps"), reroute = document.getElementById("reroute");

    if (!nxt) {
      dirEl.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L19 7"></path></svg>';
      toEl.textContent = cur.p.name + " — 오늘의 마지막";
      var back = dijkstra(POOL[cur.id].node, POOL.gate.node);
      metaEl.innerHTML = "끝나면 정문까지 <b>" + Math.round(back.m) + " m</b> · 도보 " + Math.ceil(back.m / WALK) + "분";
      noteEl.className = "nav-note"; noteEl.textContent = cur.p.note;
      stepEl.hidden = true; reroute.hidden = true;
      return;
    }
    var leg = nxt.leg || { m: 0, pts: [] }, remain = leg.m, onPath = false;
    if (myPos && leg.pts.length > 1) {
      var r = remainingOnLeg(leg, myPos);
      if (r.off < 120) { remain = r.m; onPath = true; }
    }
    var mins = Math.ceil(remain / WALK), depart = nxt.at - Math.ceil(leg.m / WALK);
    var ang = bearing(cur.p.x, cur.p.y, nxt.p.x, nxt.p.y);
    dirEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + ang.toFixed(0) + 'deg)"><path d="M12 19V5"></path><path d="M6 11l6-6 6 6"></path></svg>';
    toEl.textContent = nxt.p.name;
    metaEl.innerHTML = COMPASS[Math.round(ang / 45) % 8] + "쪽 · <b>" + Math.round(remain) + " m</b>"
      + (onPath ? ' <span style="color:var(--green)">내 위치 기준</span>' : "")
      + " · 도보 " + mins + "분 · " + C.hm(depart) + " 출발 → " + C.hm(nxt.at) + " 도착";
    var warn = nxt.problem || (isDay && nowMin > depart ? "출발 시각이 지났습니다 — 지금 움직이세요" : null);
    noteEl.className = "nav-note" + (warn ? " warn" : "");
    noteEl.textContent = warn || (nxt.p.note || "");

    var st = steps(leg);
    if (st.length) {
      stepEl.hidden = false;
      stepEl.innerHTML = st.map(function (s, k) {
        return "<li" + (k === 0 ? ' class="now"' : "") + '><span class="sm">' + Math.round(s.m) + " m</span> "
          + (s.turn === "arrive" ? "직진 후 도착" : "직진 후 " + TURN[s.turn] + "으로") + "</li>";
      }).join("");
    } else stepEl.hidden = true;

    reroute.hidden = true;
    if (myPos) {
      var near = null, from = nearestNode(myPos);
      for (var k = state.cursor + 1; k < rows.length; k++) {
        if (rows[k].p.kind === "show") continue;
        var dm = dijkstra(from, POOL[rows[k].id].node).m;
        if (near === null || dm < near.m) near = { k: k, m: dm, row: rows[k] };
      }
      if (near && near.k !== state.cursor + 1 && near.m < remain - 80) {
        reroute.hidden = false;
        reroute.innerHTML = "<span>지금 위치에서는 <b>" + C.esc(C.shortName(near.row.p.name)) + "</b>가 " + Math.round(remain - near.m) + " m 더 가깝습니다.</span>"
          + '<button class="btn sm" data-rr="' + near.k + '">그쪽 먼저</button>';
      }
    }
  }

  /* ---------------- 이벤트 ---------------- */
  planEl.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]");
    if (!b) {
      var row = e.target.closest(".item");
      if (row) { state.cursor = +row.getAttribute("data-i"); C.save(); render(); }
      return;
    }
    var i = +b.getAttribute("data-i"), act = b.getAttribute("data-act");
    var next = state.items.slice(), name = C.shortName(POOL[state.items[i]].name);
    if (act === "del") { next.splice(i, 1); propose(next, name + " 빼기"); }
    else if (act === "up" && i > 0) { next.splice(i - 1, 0, next.splice(i, 1)[0]); propose(next, name + " 앞으로"); }
    else if (act === "down" && i < next.length - 1) { next.splice(i + 1, 0, next.splice(i, 1)[0]); propose(next, name + " 뒤로"); }
  });
  document.getElementById("zones").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-zone]");
    if (!b) return;
    state.zone = b.getAttribute("data-zone");
    renderZones(); drawMap(compute());
  });
  document.getElementById("zoneitems").addEventListener("click", function (e) {
    var add = e.target.closest("button[data-insert]"), rm = e.target.closest("button[data-remove]");
    if (add) {
      var id = add.getAttribute("data-insert"), next = state.items.slice();
      next.splice(bestInsert(id).at, 0, id);
      propose(next, C.shortName(POOL[id].name) + " 넣기");
    } else if (rm) {
      var rid = rm.getAttribute("data-remove"), nx = state.items.slice();
      nx.splice(nx.indexOf(rid), 1);
      propose(nx, C.shortName(POOL[rid].name) + " 빼기");
    }
  });
  suggestEl.addEventListener("click", function (e) {
    if (!e.target.closest("#takeopt")) return;
    var opt = optimize(state.items);
    commit(opt.items, "순서 최적화", diff(compute(), compute(opt.items)));
  });
  document.getElementById("reroute").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-rr]");
    if (!b) return;
    var k = +b.getAttribute("data-rr"), next = state.items.slice(), it = next.splice(k, 1)[0];
    next.splice(state.cursor + 1, 0, it);
    propose(next, C.shortName(POOL[it].name) + " 먼저");
  });
  document.getElementById("arrive").addEventListener("click", function () {
    if (state.cursor < state.items.length - 1) state.cursor++;
    C.save(); render();
  });
  document.getElementById("back").addEventListener("click", function () {
    if (state.cursor > 0) state.cursor--;
    C.save(); render();
  });
  document.getElementById("reset").addEventListener("click", function () {
    var next = D.plan.map(function (p) { return p.id; }), d = diff(compute(), compute(next));
    state.cursor = 0; commit(next, "기본 일정", d);
  });
  document.getElementById("start").addEventListener("change", function (e) { state.start = e.target.value || "09:30"; C.save(); render(); });
  document.getElementById("sat").addEventListener("change", function (e) { state.sat = e.target.checked; C.save(); render(); });

  var geoBtn = document.getElementById("geo");
  geoBtn.addEventListener("click", function () {
    if (!navigator.geolocation) { geoBtn.textContent = "위치를 쓸 수 없습니다"; geoBtn.disabled = true; return; }
    geoBtn.textContent = "위치 확인 중…";
    navigator.geolocation.watchPosition(function (pos) {
      var o = D.origin;
      var px = ((pos.coords.longitude - o.lng0) * o.mlng - o.x0) * o.scale;
      var py = (-(pos.coords.latitude - o.lat0) * o.mlat - o.y0) * o.scale;
      if (px < -120 || py < -120 || px > D.vw + 120 || py > D.vh + 120) { myPos = null; geoBtn.textContent = "아직 공원 밖입니다"; }
      else { myPos = { x: px, y: py }; geoBtn.textContent = "내 위치 켜짐"; }
      render();
    }, function () { geoBtn.textContent = "위치 권한이 없습니다"; geoBtn.disabled = true; },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 });
  });

  C.on("plan:external", function () {
    document.getElementById("start").value = state.start;
    document.getElementById("sat").checked = state.sat;
    render();
  });

  /* ---------------- 에이전트 등록 ---------------- */
  function findStop(q) {
    q = String(q || "").trim();
    var keys = Object.keys(POOL), hit = null;
    keys.forEach(function (k) {
      var n = POOL[k].name;
      if (!hit && (k === q || n === q || n.indexOf(q) !== -1 || q.indexOf(C.shortName(n)) !== -1)) hit = POOL[k];
    });
    return hit;
  }
  function whereAt(min) {
    var rows = compute().rows, best = null;
    rows.forEach(function (r, i) {
      if (min >= r.at - 5 && min <= r.end + 10) best = { i: i, row: r };
    });
    if (!best) rows.forEach(function (r, i) {
      var d = Math.min(Math.abs(min - r.at), Math.abs(min - r.end));
      if (!best || d < best.d) best = { i: i, row: r, d: d };
    });
    return best;
  }

  C.register({
    id: "plan", name: "일정",
    api: { compute: compute, whereAt: whereAt, render: render, propose: propose, findStop: findStop },
    tools: [
      { name: "list", description: "오늘 일정 전체를 시각·장소·걷는 거리와 함께 돌려준다.",
        execute: function () {
          var p = compute();
          return {
            total_km: +(p.totalM / 1000).toFixed(2), walk_min: p.walkMin, ends_at: C.hm(p.endAt),
            items: p.rows.map(function (r, i) { return { no: i + 1, time: C.hm(r.at), name: r.p.name, zone: r.p.zl, stay_min: r.stay, problem: r.problem || null }; })
          };
        } },
      { name: "next", description: "지금 기준 다음 목적지와 거리·도보 시간.",
        execute: function () {
          var p = compute(), n = p.rows[state.cursor + 1];
          if (!n) return { done: true, message: "마지막 일정입니다." };
          return { name: n.p.name, at: C.hm(n.at), meters: Math.round(n.leg ? n.leg.m : 0), walk_min: Math.ceil((n.leg ? n.leg.m : 0) / WALK) };
        } },
      { name: "add", description: "어트랙션을 일정에 넣는다. 걷는 거리가 많이 늘면 사용자에게 확인 창을 띄운다.",
        inputSchema: { type: "object", properties: { name: { type: "string", description: "어트랙션 이름" } }, required: ["name"] },
        execute: function (a) {
          var p = findStop(a.name);
          if (!p) return { ok: false, message: "그런 이름을 찾지 못했습니다." };
          if (state.items.indexOf(p.id) !== -1) return { ok: false, message: "이미 일정에 있습니다." };
          var next = state.items.slice();
          next.splice(bestInsert(p.id).at, 0, p.id);
          var d = diff(compute(), compute(next));
          propose(next, C.shortName(p.name) + " 넣기");
          return { ok: true, name: p.name, delta_m: Math.round(d.dm), delta_walk_min: d.dwalk, needs_confirm: verdict(d) === "bad", new_problems: d.newProblems };
        } },
      { name: "remove", description: "어트랙션을 일정에서 뺀다.",
        inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        execute: function (a) {
          var p = findStop(a.name);
          if (!p || state.items.indexOf(p.id) === -1) return { ok: false, message: "일정에 없습니다." };
          var next = state.items.slice();
          next.splice(next.indexOf(p.id), 1);
          var d = diff(compute(), compute(next));
          propose(next, C.shortName(p.name) + " 빼기");
          return { ok: true, name: p.name, delta_m: Math.round(d.dm), delta_walk_min: d.dwalk };
        } },
      { name: "optimize", description: "걷는 거리가 줄도록 순서를 다시 짠다.",
        execute: function () {
          var before = compute(), opt = optimize(state.items), d = diff(before, compute(opt.items));
          if (d.dm > -30) return { ok: false, message: "이미 충분히 짧습니다.", delta_m: Math.round(d.dm) };
          commit(opt.items, "순서 최적화", d);
          return { ok: true, delta_m: Math.round(d.dm), delta_walk_min: d.dwalk };
        } }
    ]
  });

  window.PlanAgent = { compute: compute, whereAt: whereAt, render: render };
  render();
  setInterval(function () { drawNav(compute()); }, 30000);
})();
