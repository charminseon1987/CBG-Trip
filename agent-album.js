/* ============================================================
   앨범 에이전트 — 사진 업로드 · 일정 블록에 자동 분류 · 캡션
   ============================================================ */
(function () {
  "use strict";
  var C = window.Core;
  var photos = [], col = null, assets = null, tripId = null, unsub = null;

  var gridEl = document.getElementById("albumGrid");
  var headEl = document.getElementById("albumHead");
  var fileEl = document.getElementById("photoFile");
  var pickEl = document.getElementById("photoPick");
  var lightEl = document.getElementById("lightbox");

  /* ---------- 저장소 ---------- */
  function bind(id) {
    tripId = id;
    photos = [];
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    col = C.caps.db ? C.caps.db.collection("trips/" + id + "/photos") : null;
    if (col) {
      unsub = col.onSnapshot(function (snap) {
        photos = snap.docs.map(function (d) { var o = d.data() || {}; o._id = d.id; return o; });
        photos.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
        render();
      }, function () {});
    }
    render();
  }

  /* ---------- 업로드 ---------- */
  function compress(file, max, q) {
    return (window.createImageBitmap ? createImageBitmap(file, { imageOrientation: "from-image" }) : Promise.reject())
      .then(function (bmp) {
        var s = Math.min(1, max / Math.max(bmp.width, bmp.height));
        var cv = document.createElement("canvas");
        cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
        cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
        return new Promise(function (res) { cv.toBlob(function (b) { res({ blob: b || file, w: cv.width, h: cv.height }); }, "image/jpeg", q); });
      })
      .catch(function () { return { blob: file, w: 0, h: 0 }; });
  }

  function upload(files) {
    if (!assets || !col) { C.toast("이 화면에서는 사진을 올릴 수 없습니다", "warn"); return; }
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!list.length) return;
    var done = 0;
    C.toast("사진 " + list.length + "장 올리는 중…");
    list.reduce(function (chain, f) {
      return chain.then(function () {
        return compress(f, 1600, 0.82).then(function (r) {
          return assets.upload(r.blob, { contentType: "image/jpeg" }).then(function (a) {
            var ts = f.lastModified || Date.now();
            return col.doc(C.uid()).set({ assetId: a.id, ts: ts, w: r.w, h: r.h, caption: "", name: f.name || "" });
          });
        }).then(function () { done++; });
      }).catch(function () {});
    }, Promise.resolve()).then(function () {
      C.toast("사진 " + done + "장 저장했습니다", "good");
    });
  }

  /* ---------- 렌더 ---------- */
  function minutesOf(ts) { var d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); }
  function groupOf(p) {
    if (window.PlanAgent && tripId === "everland-1003") {
      var w = window.PlanAgent.whereAt(minutesOf(p.ts));
      if (w) return { key: "s" + w.i, label: (w.i + 1) + ". " + C.shortName(w.row.p.name), sub: C.hm(w.row.at) };
    }
    var h = new Date(p.ts).getHours();
    return { key: "h" + h, label: h + "시", sub: "" };
  }

  function render() {
    var can = !!assets && !!col;
    pickEl.disabled = !can;
    pickEl.textContent = can ? "사진 고르기" : (C.caps.assets === null && C.caps.db === null ? "사진은 claude.ai에서만" : "사진 고르기");

    headEl.innerHTML = '<div class="fact"><dt>사진</dt><dd>' + photos.length + "장</dd></div>"
      + '<div class="fact"><dt>처음</dt><dd>' + (photos.length ? C.hm(minutesOf(photos[0].ts)) : "—") + "</dd></div>"
      + '<div class="fact"><dt>마지막</dt><dd>' + (photos.length ? C.hm(minutesOf(photos[photos.length - 1].ts)) : "—") + "</dd></div>"
      + '<div class="fact"><dt>캡션</dt><dd>' + photos.filter(function (p) { return p.caption; }).length + "개</dd></div>";

    if (!photos.length) {
      gridEl.innerHTML = '<div class="empty"><img src="cat-stretch.jpg" alt="러그 위에 길게 누운 고양이" loading="lazy">'
        + '<p>아직 사진이 없어요. 냥이처럼 늘어져 기다리는 중…<br>폰에서 그날 찍은 사진을 고르면 <b>찍힌 시각으로 일정 블록에 자동 분류</b>됩니다.</p></div>';
      return;
    }
    var groups = [], map = {};
    photos.forEach(function (p) {
      var g = groupOf(p);
      if (!map[g.key]) { map[g.key] = { label: g.label, sub: g.sub, items: [] }; groups.push(map[g.key]); }
      map[g.key].items.push(p);
    });
    gridEl.innerHTML = groups.map(function (g) {
      return '<div class="pgroup"><div class="pghead">' + C.esc(g.label) + (g.sub ? '<span class="pgsub">' + g.sub + "</span>" : "") + "</div>"
        + '<div class="pgrid">' + g.items.map(function (p) {
          return '<figure class="ph" data-id="' + p._id + '">'
            + '<img src="/_blob/' + p.assetId + '" alt="' + C.esc(p.caption || "여행 사진") + '" loading="lazy">'
            + '<figcaption><input class="cap" data-id="' + p._id + '" value="' + C.esc(p.caption || "") + '" placeholder="한 줄 메모">'
            + '<button class="icb del" data-del="' + p._id + '" aria-label="사진 삭제">&#10005;</button></figcaption></figure>';
        }).join("") + "</div></div>";
    }).join("");
  }

  /* ---------- 이벤트 ---------- */
  pickEl.addEventListener("click", function () { fileEl.click(); });
  fileEl.addEventListener("change", function (e) { upload(e.target.files); e.target.value = ""; });

  gridEl.addEventListener("change", function (e) {
    var inp = e.target.closest("input.cap");
    if (!inp || !col) return;
    var id = inp.getAttribute("data-id"), p = photos.filter(function (x) { return x._id === id; })[0];
    if (!p) return;
    col.doc(id).set({ assetId: p.assetId, ts: p.ts, w: p.w, h: p.h, name: p.name, caption: inp.value }).catch(function () {});
  });
  gridEl.addEventListener("click", function (e) {
    var del = e.target.closest("button[data-del]");
    if (del) {
      var id = del.getAttribute("data-del"), p = photos.filter(function (x) { return x._id === id; })[0];
      if (!p || !col) return;
      col.doc(id).delete().then(function () { if (assets) assets.delete(p.assetId).catch(function () {}); }).catch(function () {});
      return;
    }
    var fig = e.target.closest("figure.ph");
    if (fig) {
      var pid = fig.getAttribute("data-id"), ph = photos.filter(function (x) { return x._id === pid; })[0];
      if (!ph) return;
      lightEl.innerHTML = '<img src="/_blob/' + ph.assetId + '" alt="' + C.esc(ph.caption || "사진") + '">'
        + '<div class="lbcap">' + C.esc(ph.caption || "") + "</div>";
      lightEl.hidden = false;
    }
  });
  lightEl.addEventListener("click", function () { lightEl.hidden = true; lightEl.innerHTML = ""; });

  C.on("cap:assets", function (a) { assets = a; render(); });
  C.on("cap:db", function () { if (tripId) bind(tripId); });
  C.on("trip:open", function (t) { bind(t.id); });
  C.on("plan:rendered", function () { if (photos.length) render(); });

  /* ---------- 에이전트 등록 ---------- */
  C.register({
    id: "album", name: "앨범",
    persona: "너는 여행 사진을 맡은 기록 담당이다. 사진은 찍힌 시각으로 일정 블록에 자동 분류되어 있다. "
      + "장수와 블록별 분포를 사실대로 말하고, 캡션이 비어 있으면 어느 시각 사진인지 짚어 준다. "
      + "사진이 한 장도 없으면 올리는 방법을 한 문장으로 안내한다.",
    fallback: function () {
      var by = {};
      photos.forEach(function (p) { var g = groupOf(p); by[g.label] = (by[g.label] || 0) + 1; });
      return { total: photos.length, by_block: by, captioned: photos.filter(function (p) { return p.caption; }).length };
    },
    api: { bind: bind, photos: function () { return photos; } },
    tools: [
      { name: "summary", description: "저장된 사진 수와 일정 블록별 장수.",
        execute: function () {
          var by = {};
          photos.forEach(function (p) { var g = groupOf(p); by[g.label] = (by[g.label] || 0) + 1; });
          return { total: photos.length, by_block: by, captioned: photos.filter(function (p) { return p.caption; }).length };
        } },
      { name: "caption_missing", description: "캡션이 비어 있는 사진의 시각과 장소 목록.",
        execute: function () {
          return photos.filter(function (p) { return !p.caption; }).slice(0, 20).map(function (p) {
            return { id: p._id, time: C.hm(minutesOf(p.ts)), place: groupOf(p).label };
          });
        } },
      { name: "set_caption", description: "사진 한 장에 캡션을 쓴다.",
        inputSchema: { type: "object", properties: { id: { type: "string" }, caption: { type: "string" } }, required: ["id", "caption"] },
        execute: function (a) {
          var p = photos.filter(function (x) { return x._id === a.id; })[0];
          if (!p || !col) return { ok: false };
          col.doc(a.id).set({ assetId: p.assetId, ts: p.ts, w: p.w, h: p.h, name: p.name, caption: a.caption }).catch(function () {});
          return { ok: true };
        } }
    ]
  });
})();
