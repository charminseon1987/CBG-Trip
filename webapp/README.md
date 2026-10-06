# 가족 여행 기록 — 에이전트 웹앱

일정 · 앨범 · 가계부를 담당 에이전트가 맡고, 총괄 에이전트가 말로 받은 요청을 알맞은 쪽에
넘기는 여행 기록 앱.

```
Next.js 15 (App Router) · React 19 · Tailwind v4 · TypeScript
Vercel AI SDK v5 + Anthropic  ·  Zod
저장소: 메모리 (DB 자리 — Store 인터페이스만 갈아 끼우면 됨)
지역 지도: 빌드 타임에 구운 JSON (런타임 네트워크 호출 없음)
```

## 실행

```bash
npm install
cp .env.example .env.local      # ANTHROPIC_API_KEY 를 넣는다
npm run dev                     # http://localhost:3000
```

키가 없어도 앱은 돈다. 지도·일정·가계부는 그대로 동작하고, 에이전트만 규칙 모드로 떨어진다
(`GET /api/health` 의 `model` 이 `no_key`).

## 구조

```
src/
  agents/
    harness.ts          에이전트 하나를 돌리는 공통 장치 (모델 + 도구 루프 + 호출 기록)
    registry.ts         누가 있고 무슨 도구를 쥐고 있는가
    chief.ts            총괄 — 분류 → 위임 → 종합 (스트리밍)
    prompts/index.ts    에이전트별 프롬프트. 여기만 고쳐도 나머지는 안 건드린다
    tools/plan.ts       일정 담당의 도구
    tools/misc.ts       앨범 · 회계 · 설계 담당의 도구
  lib/
    itinerary.ts        다익스트라 · 시각 계산 · or-opt · 길안내
    regions.ts          지역팩 로더 (빌드 타임 import)
    store.ts            저장소 인터페이스 + 메모리 구현  ← DB 가 들어올 자리
    http.ts             REST 응답 봉투와 검증
  app/api/...           REST 라우트
  components/           화면
data/regions/*.json     구워 둔 지역팩 (경주 211KB · 에버랜드 113KB)
scripts/build_region.py 지역팩 빌더 (로컬에서만 실행)
```

### 에이전트 하네스

에이전트 하나 = **프롬프트 + 도구 묶음 + 모델 등급**. 하네스가 하는 일은 셋뿐이다.

1. 그 에이전트의 프롬프트와 **자기 도구만** 쥐여 주고 모델을 돌린다
2. 모델이 도구를 부르면 실행하고 결과를 되먹인다 (`stopWhen: stepCountIs(n)`)
3. 무슨 도구를 어떤 입력으로 불렀는지 기록해 돌려준다 (`calls`)

숫자를 지어내지 말라는 규칙은 `GROUND_RULES` 로 모든 에이전트에 공통으로 붙는다.

| 에이전트 | 모델 | 도구 |
|---|---|---|
| `plan` 일정 | quick | list · next · candidates · add · remove · optimize |
| `designer` 설계 | default | trip_brief · save_draft · get_draft |
| `album` 앨범 | quick | summary · caption_missing · set_caption |
| `ledger` 회계 | quick | summary · list · add |
| `pass` 패스권 | quick | products · recommend · break_even · trip_context |

총괄(`chief`)은 명부에 없다. 도구가 없고, 담당의 보고만 읽고 말한다.
`add` · `remove` · `optimize` 는 **제안만 만든다** — 확정은 사용자가
`PUT /api/trips/:id/itinerary` 로 한다.

## REST API

모든 응답은 같은 봉투를 쓴다.
성공 `{ "ok": true, "data": … }` · 실패 `{ "ok": false, "error": { "code", "message" } }`

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/api/health` | 모델·저장소·지역·에이전트 상태 |
| GET | `/api/regions` | 지원 지역 요약 (지도 데이터 제외) |
| GET | `/api/regions/:key` | 지역팩 전체 · `?light=1` 이면 지도 제외 |
| GET | `/api/trips` | 여행 목록 |
| POST | `/api/trips` | 새 여행 — `region` 을 안 주면 장소 이름으로 짐작 |
| GET PATCH DELETE | `/api/trips/:id` | 여행 하나 |
| GET | `/api/trips/:id/plan` | **계산된 일정** — 시각·구간거리·경로좌표·길안내·후보 |
| GET PUT | `/api/trips/:id/itinerary` | 저장된 순서·출발시각·커서 (제안 확정) |
| GET POST | `/api/trips/:id/photos` | 사진 — 시각으로 장소가 자동으로 붙는다 |
| DELETE | `/api/trips/:id/photos/:photoId` | 사진 삭제 |
| GET | `/api/trips/:id/passes` | **패스권 비교** — 모델 없이 도는 결정적 계산 |
| GET POST | `/api/trips/:id/expenses` | 지출 — 시각으로 장소가 자동으로 붙는다 |
| DELETE | `/api/trips/:id/expenses/:expenseId` | 지출 삭제 |
| GET | `/api/agents` | 에이전트 명부 |
| POST | `/api/agents/:id/run` | 담당 하나를 직접 실행 (총괄 안 거침) |
| POST | `/api/chief` | **총괄에게 말 걸기 — NDJSON 스트림** |

### 총괄 스트림

`POST /api/chief` 는 한 줄에 하나씩 이벤트를 흘린다. 화면은 읽는 대로 그린다.

```jsonl
{"type":"route","agents":["plan"],"why":"다음 목적지를 묻는 질문"}
{"type":"handoff","agent":"plan","name":"일정"}
{"type":"report","agent":"plan","text":"…","calls":[{"tool":"next","input":{},"ms":3}]}
{"type":"text","delta":"다음은 석굴암이에요"}
{"type":"done"}
```

```bash
curl -N -X POST localhost:3000/api/chief \
  -H 'Content-Type: application/json' \
  -d '{"tripId":"everland-1003","message":"다음 어디로 가?"}'
```

## 패스권 자료

`data/passes/everland.json`. 가격은 **공식 페이지에서 직접 가져오지 못했습니다** — 에버랜드
요금 페이지는 자바스크립트 앱이고 가격 API가 외부 요청에 500을 돌려줍니다. 그래서 공개 정리
문서에서 옮긴 값이고, 파일에 `asOf` · `sources` · `verifyUrl` 을 함께 적어 둡니다. 패스권
에이전트는 답할 때마다 공식 확인을 권하도록 프롬프트에 박아 뒀습니다.

추천의 산수는 전부 `src/lib/passes.ts` 가 하고 모델은 말로 옮기기만 합니다.

- `quote()` — 종일권과 각 정기권을 같은 자로 비교, 손익분기 횟수 계산
- `bestMix()` — **사람마다 다른 권종**을 샀을 때의 최저가 (보통 이게 진짜 답)
- 위크데이 정기권은 주말에 못 쓰므로 기본 비교에서 빼고, `bestMixIfWeekdayOnly` 로 따로 준다

```bash
curl "localhost:3000/api/trips/everland-1003/passes?visits=4&adult=2&child=2"
```

## 지역팩

지도·도로망·관광지는 **빌드 타임에** 굽는다. 배포된 앱은 결과 JSON 만 읽으므로
런타임에 파이썬도, 외부 API 호출도 없다.

```bash
python scripts/build_region.py --key gyeongju
```

새 지역을 더하려면 `scripts/build_region.py` 의 `REGIONS` 에 bbox·관광지 목록을 적고,
돌린 뒤 `src/lib/regions.ts` 의 `PACKS` 와 `HINTS` 에 한 줄씩 더한다.

좌표와 도로망은 OpenStreetMap (ODbL). **어디를 넣을지는 사람이 정한다.** 외부 평점을
적을 때는 출처를 지역팩의 `source` 에 밝힌다 — 지어내지 않는다.

지역팩이 없는 여행은 `designer` 에이전트가 지도 없이 하루 시간표를 짠다.

## 아직 안 한 것

- **DB.** `src/lib/store.ts` 의 `Store` 인터페이스만 구현하면 된다. 메모리 구현이라
  서버가 재시작하거나 서버리스 인스턴스가 바뀌면 날아간다. 데모·개발용이다.
- **사진 업로드.** 지금은 URL/data URI 만 받는다. Vercel Blob 이나 S3 를 붙이고
  `POST /api/trips/:id/photos` 에서 업로드 URL 을 내주면 된다.
- **인증.** 지금은 누구나 모든 여행을 본다.
- **설계 결과 저장.** `drafts` 가 메모리 Map 이다 (`src/agents/tools/misc.ts`). DB 를 붙일 때
  `store` 로 옮긴다.
- **레이트 리밋.** `/api/chief` 와 `/api/agents/:id/run` 은 호출마다 모델 비용이 든다.

## 배포 (Vercel)

```bash
vercel                              # 프로젝트 연결
vercel env add ANTHROPIC_API_KEY    # Production · Preview 양쪽에
vercel --prod
```

`/api/chief` 와 `/api/agents/:id/run` 은 `maxDuration = 60` 이다. 모델 응답이 더 길어질
수 있으면 올린다.

### 사진 · 여행일기

사진 탭은 날짜별로 나뉜다. 브라우저가 EXIF 의 찍은 날짜·시각을 읽어 그날로 넣고, 긴 변 1600px JPEG 로 줄여 올린다.
날짜마다 **오늘의 여행일기**를 쓸 수 있다. 장면은 **사진첩 시간순**으로 묶는다 — 일정 블록이 같은 사진끼리,
장소를 모르면 30분 넘게 벌어질 때 새 장면. 모델은 `src/agents/prompts/diary.md` 를 따라 글(제목·문장·이름표·말풍선)만 쓰고,
모델이 없으면 규칙으로 채운다. 화면은 가로 스크랩북에 장면을 ㄹ자 점선으로 잇는다(`components/DiaryPage.tsx`):
넓으면 한 줄에 3장면, 중간 2, 폰 1(세로 점선).

| 메서드 | 경로 | 하는 일 |
|---|---|---|
| GET | `/api/trips/:id/photos?date=YYYY-MM-DD` | 그날 사진 + `days`(날짜 띠: 며칠째·장수·일기 여부) |
| POST | `/api/trips/:id/photos` | 사진 추가 — `date` 생략 시 여행 첫날 |
| PATCH | `/api/trips/:id/photos/:photoId` | 캡션·날짜·시각·장소 고치기 |
| GET | `/api/trips/:id/diary?date=` | 그날 일기 (날짜 없으면 전부) |
| POST | `/api/trips/:id/diary` | `{ date, memo }` 로 일기 쓰기·다시 쓰기 |
| PATCH | `/api/trips/:id/diary` | 글만 고치기 — 제목·문장·이름표·말풍선·스티커·표지 (장면의 시각·사진 묶음은 그대로) |

총괄에게 "오늘 일기 써 줘"라고 말하면 앨범 담당이 `write_diary` 도구로 같은 일을 한다.
