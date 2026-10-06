# -*- coding: utf-8 -*-
"""
장소 상세팩 만들기 — 특징 · 역사 · 썸네일 사진

    python scripts/build_detail.py gyeongju everland

지역팩(data/regions/<key>.json) 의 pool 을 훑어 한국어 위키백과에서
  · 특징  = 머리글 요약 (REST summary extract)
  · 역사  = 본문의 '역사/연혁/창건' 절 앞부분
  · 사진  = 대표 이미지를 내려받아 public/places/<key>/<id>.jpg 로 저장
를 모아 data/regions/<key>.detail.json 에 굽는다.

왜 빌드 타임인가
  런타임에 위키백과를 부르면 느리고, 끊기면 화면이 비고, 남의 서버에
  사용자 수만큼 부담을 준다. 한 번 구워 두면 앱은 네트워크 없이 돈다.

사진 저작권
  위키백과(위키미디어 공용) 이미지는 대부분 CC 계열이라 출처와 라이선스를
  밝히면 쓸 수 있다. 그래서 작가·라이선스를 같이 저장하고 화면에 적는다.
  항목이 없는 곳(에버랜드 어트랙션 대부분)은 사진을 넣지 않는다 —
  아무 데서나 긁어오면 저작권 문제가 된다.
"""
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "family-trip-planner/1.0 (local build; contact: local user)"

# 장소 이름과 위키백과 문서 제목이 다른 곳만 적는다
TITLE = {
    "daereungwon": "대릉원",
    "hwangridan": "황리단길",
    "museum": "국립경주박물관",
    "wolji": "경주 동궁과 월지",
    "hwangnyongsa": "황룡사",
    "poseokjeong": "포석정",
    "bongwhangdae": "봉황대",
    "hwangnambbang": "황남빵",
    "bomun": "보문관광단지",
    "gyeongjuworld": "경주월드",
    "kimyusin": "김유신묘",
    "gyochon": "경주 교촌마을",
    "luge": None,          # 문서 없음 — 찾지 않는다
    "gate": None,
    "gate_out": None,
    "jungle": None,
    "monimo": "T 엑스프레스",   # 모니모RUSH 로 넘어간다
    "safari": "에버랜드",
    "panda": "에버랜드",
}
HIST_HEAD = re.compile(r"^(=+)\s*(역사|연혁|창건|유래|기원)\s*=+\s*$", re.M)
HEAD = re.compile(r"^(=+)[^=].*?=+\s*$", re.M)


_last = [0.0]
GAP = 1.2            # 위키백과를 1초에 한 번보다 자주 부르지 않는다


def get(url, binary=False, timeout=25):
    """간격을 지켜 부르고, 429 가 오면 기다렸다 다시 부른다.
       처음엔 0.25초 간격으로 돌려 절반이 429 로 막혔다 — 그래서 넣었다."""
    for attempt in range(4):
        wait = GAP - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        r = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(r, timeout=timeout) as res:
                return res.read() if binary else json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise


def summary(title):
    u = "https://ko.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title)
    d = get(u)
    if d.get("type") not in ("standard", "disambiguation"):
        return None
    return d


def fulltext(title):
    u = ("https://ko.wikipedia.org/w/api.php?action=query&format=json&prop=extracts"
         "&explaintext=1&redirects=1&titles=" + urllib.parse.quote(title))
    pages = get(u)["query"]["pages"]
    for p in pages.values():
        return p.get("extract") or ""
    return ""


def history_of(text):
    """본문에서 '역사' 절만 떼어 온다 — 없으면 빈 문자열.

    같은 깊이의 다음 제목에서 끊는다. 깊이를 보지 않고 아무 제목에서나
    끊었더니 '역사' 바로 아래의 '=== 창건 ===' 에 걸려 한 줄만 남았다
    (불국사가 '《불국사고금창기》를 주로 따르기로 한다.' 한 줄이 되었다).
    소제목은 본문에 그대로 두고 화면에서 읽히게 한다."""
    m = HIST_HEAD.search(text)
    if not m:
        return ""
    depth = len(m.group(1))
    rest = text[m.end():]
    cut = len(rest)
    for h in HEAD.finditer(rest):
        if len(h.group(1)) <= depth:
            cut = h.start()
            break
    body = re.sub(r"\n{2,}", "\n", rest[:cut]).strip()
    return body[:900]


def orig_name(thumb):
    """썸네일 주소에서 원본 파일 이름을 뽑는다.

      .../thumb/e/eb/Lotus_Flower_Bridge....jpg/330px-Lotus_Flower_Bridge....jpg?utm_source=...
                                                     ^^^^ 여기서 뒤쪽만

    처음엔 ? 뒤의 질의문자열을 떼지 않아 파일 이름이
    'Lotus....jpg?utm_source=...' 이 되었고, 공용에서 늘 '없는 파일' 로 나와
    작가·라이선스가 전부 비었다."""
    last = thumb.split("?", 1)[0].rsplit("/", 1)[-1]
    return urllib.parse.unquote(last).split("px-", 1)[-1]


def credit_for(file_title):
    """이미지의 작가·라이선스 — 밝히고 써야 한다"""
    u = ("https://commons.wikimedia.org/w/api.php?action=query&format=json"
         "&prop=imageinfo&iiprop=extmetadata|url&titles=" + urllib.parse.quote(file_title))
    try:
        pages = get(u)["query"]["pages"]
        for p in pages.values():
            ii = (p.get("imageinfo") or [{}])[0]
            ex = ii.get("extmetadata") or {}
            artist = re.sub(r"<[^>]+>", "", (ex.get("Artist", {}).get("value") or "")).strip()
            lic = (ex.get("LicenseShortName", {}).get("value") or "").strip()
            return {"artist": artist[:80], "license": lic[:40],
                    "page": ii.get("descriptionurl") or ""}
    except Exception:
        pass
    return {"artist": "", "license": "", "page": ""}


def thumb_url(d):
    """summary 가 준 썸네일 주소를 그대로 쓴다.
       폭을 임의로 800px 로 바꿔 부르니 400 이 돌아왔다 —
       위키미디어는 허용된 크기만 만들어 준다. 원본은 너무 커서 쓰지 않는다."""
    return (d.get("thumbnail") or {}).get("source") or None


def build(key):
    pack = json.load(io.open(os.path.join(ROOT, "data", "regions", "%s.json" % key),
                             encoding="utf-8"))
    imgdir = os.path.join(ROOT, "public", "places", key)
    if not os.path.isdir(imgdir):
        os.makedirs(imgdir)

    out = {}
    for poi in pack["pool"]:
        pid, name = poi["id"], poi["name"]
        title = TITLE.get(pid, name.split(" · ")[0].split(" — ")[0].strip())
        row = {
            # 특징은 지역팩이 이미 쥐고 있는 한 줄 — 위키에 항목이 없어도 늘 있다
            "tip": poi.get("note") or "",
            "kind": poi.get("kind"),
            "stay": poi.get("stay"),
            "open": poi.get("open") or "",
            "close": poi.get("close") or "",
        }
        if title:
            try:
                d = summary(title)
            except Exception as e:
                d = None
                print("  ! %s 요약 실패 %s" % (pid, str(e)[:60]))
            if d:
                row["about"] = (d.get("extract") or "").strip()
                row["wiki"] = ((d.get("content_urls") or {}).get("desktop") or {}).get("page", "")
                row["wikiTitle"] = d.get("title") or title
                try:
                    row["history"] = history_of(fulltext(title))
                except Exception:
                    row["history"] = ""
                u = thumb_url(d)
                if u:
                    try:
                        blob = get(u, binary=True)
                        ext = ".jpg" if ".jp" in u.lower() else os.path.splitext(u)[1][:5] or ".jpg"
                        fn = "%s%s" % (pid, ext)
                        io.open(os.path.join(imgdir, fn), "wb").write(blob)
                        row["img"] = "/places/%s/%s" % (key, fn)
                        row["credit"] = credit_for("File:" + orig_name(u))
                    except Exception as e:
                        print("  ! %s 사진 실패 %s" % (pid, str(e)[:60]))
        got = []
        if row.get("img"):
            got.append("사진")
        if row.get("about"):
            got.append("설명")
        if row.get("history"):
            got.append("역사")
        print("  %-14s %s" % (pid, "·".join(got) or "특징만"))
        out[pid] = row

    p = os.path.join(ROOT, "data", "regions", "%s.detail.json" % key)
    io.open(p, "w", encoding="utf-8").write(
        json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True))
    n = sum(1 for v in out.values() if v.get("img"))
    print("%s → %s  (%d곳 중 사진 %d, 역사 %d)" % (
        key, os.path.relpath(p, ROOT), len(out), n,
        sum(1 for v in out.values() if v.get("history"))))


if __name__ == "__main__":
    for k in (sys.argv[1:] or ["gyeongju", "everland"]):
        print("== %s" % k)
        build(k)
