---
name: region-pack
description: 새 여행 지역의 지도·도로망·관광지 데이터를 OpenStreetMap에서 받아 webapp/data/regions/<key>.json으로 굽는다. 사용자가 "경주 말고 부산도 넣어줘" 처럼 새 지역 추가를 요청할 때 쓴다.
---

# 지역팩 만들기

새 지역을 넣으면 그 여행이 에버랜드와 같은 화면(오늘일정 | 지도 | 길안내)을 쓴다.
빌드 타임에만 도는 작업이다 — 배포된 앱은 결과 JSON 만 읽는다.

## 순서

### 1. 어디를 넣을지 정한다 (사람이 하는 일)

OSM 은 좌표를 주지만 "꼭 가봐야 할 곳"은 모른다. 먼저 조사한다.

- WebSearch 로 그 지역 필수 코스·핫플·맛집을 찾는다. 여러 가이드가 **공통으로** 꼽는 곳을 고른다
- 평점을 적을 거면 출처(다이닝코드·구글 등)와 함께 적는다. **별점을 지어내지 않는다**
- 15~25곳이 적당하다. 그중 하루 코스로 8~12곳을 고른다

### 2. 좌표를 받는다

```bash
# 관광지 — 대부분 OSM 에 있다
curl -s "https://overpass-api.de/api/interpreter" --data-urlencode 'data=
[out:json][timeout:120];
(node["tourism"~"attraction|museum|viewpoint|theme_park"]["name"](LAT0,LNG0,LAT1,LNG1);
 node["historic"]["name"](LAT0,LNG0,LAT1,LNG1););
out body 200;'
```

OSM 에 없는 가게·거리는 Nominatim 으로 지오코딩한다 (초당 1회 이하, User-Agent 필수).
그래도 못 찾으면 그 **거리·지구**를 대표 좌표로 쓰고 메모에 가게 이름을 적는다.

### 3. 스크립트에 등록하고 굽는다

`webapp/scripts/build_region.py` 의 `REGIONS` 에 항목을 더한다.

- `bbox` — 관광 핵심권만. 넓으면 도로망이 커져 느려진다
- `mode`/`speed` — 걸어 다니는 공원이면 `walk`/70, 차로 도는 도시면 `drive`/400 (m/분)
- `stops` — (id, 이름, 구역, 위도, 경도, 종류, 체류분, 중요도, 여는시각, 닫는시각, 메모)
- `plan` — 기본 하루. **한 방향으로 흐르게** 짜서 동선이 겹치지 않게 한다.
  야경이 핵심인 곳은 마지막에 둔다

```bash
cd webapp && python scripts/build_region.py --key <key>
```

출력에 `끊김:` 경고가 있으면 그 장소가 도로망과 연결되지 않은 것이다 — bbox 를 넓히거나
그 지점 좌표를 도로 쪽으로 옮긴다.

### 4. 앱에 연결한다

`webapp/src/lib/regions.ts`:
- `import <key> from "@data/regions/<key>.json"` 과 `PACKS` 에 추가
- `HINTS` 에 장소 이름 키워드 추가 (사용자가 "부산" 이라고 쓰면 잡히도록)

### 5. 확인한다

```bash
cd webapp && npx next build && npx next start -p 3100
curl -s "http://127.0.0.1:3100/api/trips/<tripId>/plan" | head -c 400
```

- 총 거리가 상식적인가 (도시 하루 코스면 15~40km, 공원이면 3~6km)
- 각 구간 거리가 직선거리보다 긴가 (같으면 도로망을 안 타고 있다)
- 지도 SVG 요소가 수백 개를 넘지 않는가 — 넘으면 느려진다.
  같은 종류 선을 `<path>` 하나로 합치는 것이 핵심이다 (스크립트가 이미 그렇게 한다)

## 주의

- 지도 SVG 가 쓰는 CSS 변수(`--m-ground` `--m-green` `--m-water` `--m-path` `--m-road`)는
  `webapp/src/app/globals.css` 에 정의돼 있어야 한다. 없으면 **검게 칠해진다**
- 경로선 색은 지도 바탕(특히 물)과 겹치면 안 된다. `TripMap.tsx` 의 `PHASE` 는
  채도 높은 색만 쓰고 흰 테두리를 깐다
- 좌표·도로망은 OpenStreetMap 기여자 (ODbL). 지역팩의 `source` 에 반드시 밝힌다
