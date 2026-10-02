# -*- coding: utf-8 -*-
"""
지역팩 빌더 — OpenStreetMap 에서 받아 data/regions/<key>.json 으로 굽는다.

이 스크립트는 빌드 타임에만 돈다. 배포된 앱은 결과 JSON 만 읽는다.

  python scripts/build_region.py --key gyeongju

새 지역을 더하려면
  1) 아래 REGIONS 에 bbox·이동수단·관광지 목록을 적고
  2) 이 스크립트를 돌리고
  3) src/lib/regions.ts 의 PACKS 와 HINTS 에 한 줄씩 더한다

좌표는 OSM 에서 받아 쓰고, 어디를 넣을지(선정)는 사람이 정한다.
별점 같은 외부 평점은 출처를 source 에 밝혀 적는다 — 지어내지 않는다.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "data", "regions")
ENDPOINT = "https://overpass-api.de/api/interpreter"
UA = "family-trip-planner/1.0 (region pack builder)"

# ---------------------------------------------------------------- 지역 정의
REGIONS = {
    "gyeongju": {
        "title": "경주",
        "mode": "drive",
        "speed": 400,              # m/분 ≈ 24km/h (주차·도보 포함)
        "bbox": (35.760, 129.180, 35.870, 129.370),
        "size": (980, 700),
        "source": (
            "지도·좌표 OpenStreetMap 기여자 (ODbL) · "
            "관광지 선정은 공개 여행 가이드, 맛집 평점은 다이닝코드 공개 순위를 참고했습니다."
        ),
        "zones": [
            {"id": "세계유산", "name": "세계유산", "color": "var(--z-magic)"},
            {"id": "고분", "name": "고분·능", "color": "var(--z-amer)"},
            {"id": "유적", "name": "유적·한옥", "color": "var(--z-global)"},
            {"id": "박물관", "name": "박물관", "color": "var(--z-euro)"},
            {"id": "먹거리", "name": "먹거리", "color": "var(--z-zoo)"},
            {"id": "호수", "name": "호수·단지", "color": "var(--gold)"},
            {"id": "놀이공원", "name": "놀이공원", "color": "var(--rose)"},
            {"id": "체험", "name": "체험", "color": "var(--indigo)"},
        ],
        # id, 이름, 구역, 위도, 경도, 종류, 체류(분), 중요도, 여는시각, 닫는시각, 메모
        "stops": [
            ("bulguksa", "불국사", "세계유산", 35.78901, 129.33150, "see", 90, 3, "0900", "1700",
             "유네스코 세계유산. 다보탑·석가탑과 청운교 백운교를 보려면 한 시간은 잡으세요."),
            ("seokguram", "석굴암", "세계유산", 35.79479, 129.34925, "see", 60, 3, "0900", "1730",
             "불국사에서 산길로 10분 더 올라갑니다. 주차장에서 석굴까지 걸어서 10분."),
            ("daereungwon", "대릉원 · 천마총", "고분", 35.83859, 129.21050, "see", 50, 3, "0900", "2200",
             "천마총 내부를 볼 수 있는 유일한 고분. 목련 나무 포토존이 유명합니다."),
            ("cheomseongdae", "첨성대", "고분", 35.83470, 129.21898, "see", 30, 3, "", "",
             "동양에서 가장 오래된 천문대. 밤에 조명이 켜지면 또 다릅니다."),
            ("woljeonggyo", "월정교", "유적", 35.82926, 129.21814, "see", 30, 2, "", "",
             "복원한 신라 다리. 해 질 녘 반영 사진이 잘 나옵니다."),
            ("gyochon", "교촌한옥마을", "유적", 35.82965, 129.21492, "see", 40, 2, "", "",
             "최부잣집과 교리김밥·요석궁이 모여 있는 한옥 골목."),
            ("hwangridan", "황리단길", "먹거리", 35.83658, 129.20966, "food", 70, 3, "", "",
             "경주 핫플 먹자골목. 다이닝코드 평점 복길 ★4.5 · 동리 ★4.3 · 마시조은집 ★4.2 · 별채반 교동쌈밥 ★3.9."),
            ("museum", "국립경주박물관", "박물관", 35.82964, 129.22887, "see", 60, 3, "1000", "1800",
             "성덕대왕신종(에밀레종)이 있는 곳. 무료입니다."),
            ("wolji", "동궁과 월지", "유적", 35.83476, 129.22642, "see", 70, 3, "0900", "2200",
             "밤 조명이 켜진 뒤가 압권. 하루의 마지막에 두는 것이 정석입니다."),
            ("gyerim", "계림", "유적", 35.83216, 129.21797, "see", 20, 2, "", "",
             "김알지 설화의 숲. 첨성대에서 걸어서 갑니다."),
            ("bunhwangsa", "분황사", "유적", 35.84089, 129.23368, "see", 30, 1, "0900", "1800",
             "신라에서 가장 오래된 석탑이 있습니다."),
            ("hwangnyongsa", "황룡사지", "유적", 35.83703, 129.23267, "see", 30, 1, "", "",
             "터만 남은 거대한 절. 역사문화관에서 복원 모형을 봅니다."),
            ("poseokjeong", "포석정", "유적", 35.80699, 129.21276, "see", 25, 1, "0900", "1800",
             "신라의 마지막 연회터. 남산 자락 입구입니다."),
            ("oreung", "오릉", "유적", 35.82320, 129.20841, "see", 30, 1, "0900", "1800",
             "박혁거세를 포함한 다섯 능. 소나무 숲이 좋습니다."),
            ("bongwhangdae", "봉황대", "고분", 35.84128, 129.21064, "see", 20, 1, "", "",
             "시내 한복판의 큰 고분. 황리단길과 붙어 있습니다."),
            ("hwangnambbang", "황남빵 본점", "먹거리", 35.84080, 129.21375, "food", 20, 2, "0800", "2200",
             "경주 대표 기념 먹거리. 포장 줄이 깁니다."),
            ("bomun", "보문호수", "호수", 35.84476, 129.27738, "see", 40, 2, "", "",
             "호수 둘레길과 카페. 벚꽃철에 특히 붐빕니다."),
            ("gyeongjuworld", "경주월드", "놀이공원", 35.83705, 129.28190, "play", 180, 2, "1000", "2100",
             "드라켄·파이터 같은 큰 기구가 있는 지역 놀이공원."),
            ("luge", "경주 루지월드", "체험", 35.84478, 129.29109, "play", 60, 2, "1000", "1800",
             "보문단지 안. 아이들과 가면 반응이 좋습니다."),
            ("kimyusin", "김유신장군묘", "유적", 35.84575, 129.19098, "see", 25, 1, "0900", "1800",
             "시내 서쪽. 올라가는 길이 조용합니다."),
        ],
        # 기본 하루 — 서에서 동으로 한 방향, 야경이 핵심인 곳을 마지막에
        "plan": [
            ("bulguksa", "09:00"), ("seokguram", ""), ("hwangridan", ""), ("daereungwon", ""),
            ("cheomseongdae", ""), ("gyerim", ""), ("woljeonggyo", ""), ("gyochon", ""),
            ("museum", ""), ("wolji", ""),
        ],
    },
}

# 길찾기에 쓰는 도로 등급 (차 이동 기준)
BIG = {"motorway", "trunk", "primary", "motorway_link", "trunk_link", "primary_link"}
MID = {"secondary", "tertiary", "secondary_link", "tertiary_link"}
KEEP = BIG | MID | {"unclassified"}
GRID_M = 26.0          # 이 안의 점은 같은 교차점으로 본다
RDP_EPS = 1.7          # 지도 선 단순화 (px)


def overpass(query: str, label: str) -> dict:
    req = urllib.request.Request(
        ENDPOINT, data=("data=" + query).encode("utf-8"), headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=240))
            print(f"  {label}: {len(d.get('elements', []))} elements")
            return d
        except Exception as e:                       # 공개 서버라 가끔 504 가 난다
            print(f"  {label}: 재시도 {attempt + 1} ({e})", file=sys.stderr)
            time.sleep(6)
    raise SystemExit(f"Overpass 실패: {label}")


def rdp(pts, eps):
    """선을 눈에 안 보일 만큼만 단순화한다 (Ramer–Douglas–Peucker)."""
    if len(pts) < 3:
        return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    den = math.hypot(dx, dy)
    best, bi = -1.0, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = (abs(dy * px - dx * py + x1 * y0 - y1 * x0) / den) if den else math.hypot(px - x0, py - y0)
        if d > best:
            best, bi = d, i
    if best <= eps:
        return [pts[0], pts[-1]]
    return rdp(pts[: bi + 1], eps)[:-1] + rdp(pts[bi:], eps)


def plen(pts):
    return sum(math.dist(pts[i], pts[i - 1]) for i in range(1, len(pts)))


def build(key: str) -> dict:
    cfg = REGIONS[key]
    lat0, lng0, lat1, lng1 = cfg["bbox"]
    vw, vh = cfg["size"]
    bbox = f"{lat0},{lng0},{lat1},{lng1}"

    mlat = 110985.0
    mlng = 111319.49 * math.cos(math.radians((lat0 + lat1) / 2))
    w_m, h_m = (lng1 - lng0) * mlng, (lat1 - lat0) * mlat
    scale = min((vw - 20) / w_m, (vh - 20) / h_m)
    ox, oy = (vw - w_m * scale) / 2, (vh - h_m * scale) / 2

    def xy(lat, lng):
        return (round(ox + (lng - lng0) * mlng * scale, 1),
                round(oy + (lat1 - lat) * mlat * scale, 1))

    print(f"[{key}] Overpass 에서 받는 중 — 공개 서버라 1~3분 걸립니다")
    road = overpass(
        f'[out:json][timeout:300];way["highway"]({bbox});out body geom;', "도로")
    base_raw = overpass(
        f'[out:json][timeout:300];('
        f'way["natural"="water"]({bbox});way["waterway"="riverbank"]({bbox});'
        f'way["landuse"~"forest|grass|recreation_ground|cemetery"]({bbox});'
        f'way["leisure"~"park|golf_course"]({bbox}););out geom;', "물·녹지")

    # ---- 바탕 (물·녹지) ----
    green, water = [], []
    for e in base_raw["elements"]:
        g = e.get("geometry") or []
        if len(g) < 3:
            continue
        pts = rdp([xy(p["lat"], p["lon"]) for p in g], RDP_EPS)
        if plen(pts) < 8:
            continue
        t = e.get("tags", {})
        (water if t.get("natural") == "water" or t.get("waterway") == "riverbank" else green).append(pts)

    # ---- 도로 → 그래프 + 지도선 ----
    nodes, index, edges = [], {}, []

    def nid(lat, lng):
        k = (int(round(lat * mlat / GRID_M)), int(round(lng * mlng / GRID_M)))
        if k not in index:
            index[k] = len(nodes)
            nodes.append(list(xy(lat, lng)))
        return index[k]

    road_big, road_mid = [], []
    for e in road["elements"]:
        g = e.get("geometry") or []
        hw = e.get("tags", {}).get("highway", "")
        if hw not in KEEP or len(g) < 2:
            continue
        ids, last = [], None
        for p in g:
            i = nid(p["lat"], p["lon"])
            if i != last:
                ids.append(i)
                last = i
        if len(ids) < 2:
            continue
        for a, b in zip(ids, ids[1:]):
            edges.append((a, b) if a < b else (b, a))
        draw = rdp([tuple(nodes[i]) for i in ids], RDP_EPS)
        if plen(draw) >= 7:
            (road_big if hw in BIG else road_mid).append(draw)

    edges = sorted(set(edges))

    # ---- SVG: 종류별로 path 하나에 합친다 (요소 수가 적어야 렌더가 가볍다) ----
    def path_of(polys, close):
        out = []
        for pts in polys:
            d = "M%d %d" % pts[0] + "".join("L%d %d" % p for p in pts[1:])
            out.append(d + ("Z" if close else ""))
        return "".join(out)

    base = [f'<rect x="0" y="0" width="{vw}" height="{vh}" fill="var(--m-ground)"></rect>']
    if green:
        base.append(f'<path d="{path_of(green, True)}" fill="var(--m-green)" opacity=".55"></path>')
    if water:
        base.append(f'<path d="{path_of(water, True)}" fill="var(--m-water)"></path>')
    if road_mid:
        base.append(f'<path d="{path_of(road_mid, False)}" fill="none" stroke="var(--m-path)" '
                    f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".8"></path>')
    if road_big:
        base.append(f'<path d="{path_of(road_big, False)}" fill="none" stroke="var(--m-road)" '
                    f'stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></path>')

    # ---- 관광지를 가장 가까운 도로 노드에 붙인다 ----
    pool = []
    for sid, name, zone, lat, lng, kind, stay, rank, op, cl, note in cfg["stops"]:
        x, y = xy(lat, lng)
        nd = min(range(len(nodes)), key=lambda i: (nodes[i][0] - x) ** 2 + (nodes[i][1] - y) ** 2)
        pool.append({
            "id": sid, "name": name, "zone": zone, "zl": zone, "lat": lat, "lng": lng,
            "x": x, "y": y, "node": nd, "open": op, "close": cl, "hmin": 0, "hmax": 0,
            "wait": None, "kind": kind, "stay": stay, "rank": rank, "note": note,
        })

    # ---- 전부 길로 이어지는지 확인 ----
    import heapq
    adj = {}
    for a, b in edges:
        w = math.dist(nodes[a], nodes[b])
        adj.setdefault(a, []).append((b, w))
        adj.setdefault(b, []).append((a, w))
    start = pool[0]["node"]
    seen, pq = {start}, [(0.0, start)]
    while pq:
        _, u = heapq.heappop(pq)
        for v, w in adj.get(u, ()):
            if v not in seen:
                seen.add(v)
                heapq.heappush(pq, (0.0, v))
    lost = [p["name"] for p in pool if p["node"] not in seen]
    if lost:
        print(f"  경고: 도로망에서 끊긴 곳 — {', '.join(lost)}", file=sys.stderr)

    return {
        "key": key,
        "title": cfg["title"],
        "mode": cfg["mode"],
        "speed": cfg["speed"],
        "vw": vw, "vh": vh, "mPerPx": 1.0 / scale,
        "origin": {"x0": -ox / scale, "y0": -oy / scale, "scale": scale,
                   "lat0": lat1, "lng0": lng0, "mlat": mlat, "mlng": mlng},
        "base": "".join(base),
        "nodes": nodes,
        "edges": [list(e) for e in edges],
        "zones": cfg["zones"],
        "pool": pool,
        "plan": [{"id": a, "time": t} for a, t in cfg["plan"]],
        "source": cfg["source"],
    }


def main():
    ap = argparse.ArgumentParser(description="지역팩을 OSM 에서 받아 굽는다")
    ap.add_argument("--key", required=True, choices=sorted(REGIONS), help="지역 키")
    args = ap.parse_args()

    data = build(args.key)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.abspath(os.path.join(OUT_DIR, args.key + ".json"))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[{args.key}] {path}")
    print(f"  {os.path.getsize(path) // 1024} KB · 장소 {len(data['pool'])} · "
          f"노드 {len(data['nodes'])} · 간선 {len(data['edges'])}")


if __name__ == "__main__":
    sys.setrecursionlimit(20000)
    main()
