# EVERLAND — 가족 여행 기록

두 가지가 한 폴더에 있다. 섞지 말 것.

| 폴더 | 무엇 | 어디서 도는가 |
|---|---|---|
| 루트의 `route-1003.html` · `agent-*.js` · `region-*.js` | **Claude Artifact 판** (완성, v27) | claude.ai 아티팩트 |
| `webapp/` | **배포용 웹앱** (Next.js) | 로컬 / Vercel |

아티팩트 판은 `window.claude.use()` 런타임에 얹혀 있어 배포하면 못 쓴다. 웹앱 판이 그 후속이다.
아티팩트를 고칠 일이 생기면 `Artifact` 도구로 같은 URL(`JxqoqX3VjtHYWgt2RyrDJK`)에 재게시한다.

## webapp 규칙

**에이전트 프롬프트는 `webapp/src/agents/prompts/index.ts` 에만 있다.**
`.claude/` 에 두면 안 된다 — 배포 번들에 안 들어가서 서버가 못 읽는다.
(`.claude/` 는 Claude Code 가 쓰는 곳이고, 앱 런타임과 무관하다.)

- 에이전트를 더하려면: 프롬프트 → `tools/` 에 도구 → `registry.ts` 에 등록 → `chief.ts` 의 분류 enum·키워드
- 도구는 **제안만** 만든다. 일정 확정은 사용자가 `PUT /api/trips/:id/itinerary` 로 한다
- 숫자는 전부 `lib/` 의 결정적 함수가 계산한다. 모델은 말로 옮기기만 한다
  (`lib/itinerary.ts` 거리·시각, `lib/passes.ts` 패스권 손익)
- 모델 공급자는 `src/agents/provider.ts` 한 곳에서 고른다 (`AGENT_PROVIDER=ollama|anthropic`)

## 데이터 출처 원칙

지어내지 않는다. 출처와 확인 날짜를 데이터 파일에 같이 적는다.

| 데이터 | 방식 | 왜 |
|---|---|---|
| 지도·도로망·관광지 좌표 | **빌드 타임**에 OSM 에서 구움 (`scripts/build_region.py`) | 안 바뀜. 런타임 호출 0 |
| 일별 운영정보 | **요청 시** 공식 API 호출 + 30분 캐시 (`lib/dayinfo.ts`) | 날짜마다 바뀜 |
| 패스권 가격 | 손으로 적고 `asOf`·`sources`·`verifyUrl` 명시 (`data/passes/`) | 공식 API 가 500 을 냄 — 크롤링 실패 |

에버랜드 공식 API 중 **되는 것**:
- `GET https://wwwapi.everland.com/api/v1/iam/facilities/dailyOper?salesDate=YYYYMMDD&parkKindCd=01&faciltCateKindCd=00&langCd=ko&currentPage=1&pagePerCount=300`
- `GET .../api/v1/iam/facilities/kind?faciltCateKindCd=NN&parkKindCd=01`

**안 되는 것**: 요금·티켓 관련 엔드포인트는 전부 500. 요금 페이지 HTML 은 6,469B 에러 셸.

## 이 환경의 함정

- **Git Bash heredoc 안의 `\n`** — 도구 호출 JSON 디코딩에서 한 겹 벗겨져 실제 줄바꿈이 된다.
  파이썬 문자열에 `\n` 을 넣어야 하면 `chr(10)`/`chr(92)` 를 쓰거나 Edit 도구를 쓸 것. 여러 번 당했다.
- **`pkill -f "next start"` 가 안 듣는다.** 포트로 죽일 것:
  PowerShell `Get-NetTCPConnection -LocalPort 3100 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`
  (안 죽이면 옛 빌드가 계속 돌아 "고쳤는데 그대로"처럼 보인다)
- **curl 로 한글 JSON 을 보내면 깨진다.** 파이썬 `urllib` + `ensure_ascii=False` 로 보낼 것.
- **Chrome 확장 screenshot 이 자주 5초 타임아웃**을 낸다. 페이지는 멀쩡한 경우가 많으니
  `javascript_tool` 로 DOM 을 직접 읽어 확인할 것.
- **이 머신엔 GPU 가 없다.** Ollama 는 100% CPU, 0.1–3.4 tok/s. 로컬 모델로 UI 를 돌리기엔 느리다.

- **`webapp/.env.turso` 는 프로덕션 DB 가 아니다.** 같은 가족 데이터가 든 별개 DB 다
  (마이그레이션이 한 번도 안 들어가 있다). 배포본의 DB 를 직접 들여다보려 하면
  엉뚱한 곳을 보게 된다 — 확인은 배포된 앱의 API 로 해야 한다.
- **프리뷰 배포는 Turso 의 분기(branch) DB 를 쓴다.** 프로덕션과 데이터가 같아 보이지만
  다른 DB 다. 프리뷰에서 마이그레이션이 돌아도 프로덕션은 그대로다 (`--prod` 때 돈다).
- **비밀번호가 로컬과 Turso 가 다르다.** 로컬 파일 DB 는
  `node scripts/set-local-password.mjs <메일> <새비번>`, 배포 DB 는
  `scripts/set-password.mjs`(`.env.turso` 를 읽는다). 이걸 혼동해 "비번이 맞는데 401" 을
  한참 들여다봤다.

## 지금 상태 (2026-10-16)

**배포돼 있다 — https://cbg-trip.vercel.app** (Turso + Vercel Blob). 배포는
`cd webapp && npx vercel deploy --prod`.

된 것
- **DB** — libSQL/SQLite. `DATABASE_URL` 이 있으면 `SqlStore`, 없으면 메모리.
  마이그레이션 도구 없이 `CREATE_SQL`(매번 전부 실행)·`PATCH_SQL`(실패는 무시)로
  첫 요청에 만든다. 한 번만 돌아야 하는 손질은 `meta` 표에 표식을 남긴다
- **인증** — scrypt + 세션 쿠키. `guardTrip()` 으로 남의 여행은 404
- **가입** — `/signup` 에서 누구나. `SIGNUP_CODE` 를 넣으면 그 코드를 아는 사람만
  (지금은 **안 넣었다** = 코드 없이 가입). 가입으로는 절대 관리자가 안 된다
- **멤버십** — `trip_members` 로 owner·editor·viewer. 공동 쓰기는 전부 `needEdit()`
  를 부른다. 여행 삭제·초대·검색노출은 owner 만
- **들어오는 길 셋** — ① 초대 링크(함께 탭에서 만들고, 쓸 때까지 목록에 남아 다시
  복사된다) ② 검색 → 신청 → 주인이 권한 골라 허용 ③ 카카오(키를 넣으면 단추가 뜸)
- **검색** — `trips.discoverable` 이 켜진 여행만. 기본 꺼짐. 찾아도 제목·지역·날짜·
  인원까지만 보이고 일정·사진·가계부·멤버는 404
- **대화** — 여행별 그룹 방(`trip:<id>`)과 일대일(`dm:<작은id>:<큰id>`). 보기만 하는
  사람도 말한다. 일대일은 같은 여행·신청으로 엮임·이미 대화함 중 하나여야 열린다.
  메시지에 여행 카드를 붙일 수 있다(제목·지역·날짜까지만). 8초 폴링
- **여러 날** — `itinerary_days(여행, 날짜)` 로 날마다 한 줄. 가계부에 날짜 칸,
  사진 장소는 그 날 일정에서 찾는다. 기간을 줄이면 내용은 남고 "기간 밖" 으로 뜬다
- **사진** — 올린 사람(`photos.user_id`)의 것. 기본 "나만 보기"(`visibility`),
  남의 나만 보기는 주인에게도 404. 일기는 같이 보는 사진만 쓴다
- **일기** — 그날 사진을 장면으로 묶어 손글씨 스크랩북
- **알림** — 머리글의 종. 들어온 신청·내 신청 결과·안 읽은 말을 센다. 알림을
  쌓아 두지 않고 그때그때 센다(쌓으면 실제 상태와 어긋난다). "언제까지 봤나" 만
  chat_reads 의 `room="notices"` 한 줄로 남긴다. 신청은 **처리해야** 사라진다
- **대화 목록** — `/chat`. 여행별 그룹 방과 일대일이 한 자리에. 안 읽은 수와
  마지막 한 줄까지
- **개인 레이어** — `personal_days(여행, 사람, 날짜)`. 공동 일정 위에 "뺀 곳 ·
  나만 가는 곳 · 내 출발 시각" 만 얹는다(사본을 뜨지 않는다 — 사본은 그 순간
  갈라져 공동 일정 수정이 영영 안 간다). 일정 탭의 "공동 일정 ↔ 내 일정".
  **보기만 하는 사람도 자기 레이어는 고친다**
- **설계 초안** — 지역팩이 없는 여행은 설계 에이전트가 짠 하루 시간표가 일정의
  전부다. `drafts` 표에 남고 지도 없는 화면에 그려진다

안 된 것 / 다음에 할 것
- **카카오 키를 Vercel 에 안 넣었다** — 넣으면 로그인 화면에 단추가 생긴다
  (`KAKAO_REST_KEY`·`KAKAO_CLIENT_SECRET`·`KAKAO_REDIRECT_URI`)
- **모델(냥이 채팅)** — Anthropic 크레딧 부족. `AGENT_*` 로 OpenAI 호환 주소를
  꽂는 길은 열려 있다. 일정·지도·가계부·사진·일기는 모델 없이 다 돈다
- **프로덕션 화면을 사람 눈으로 본 검증이 아직 없다.** 오늘까지 만든 것은 전부
  일회용 DB 에 앱을 새로 깔아 API 로 확인했다(묶음마다 9~43가지). 배포본에
  로그인해 다섯 탭(일정·사진·일기·가계부·함께·대화)을 훑는 일이 남았다
- 알림이 앱 안에만 있다 — 메일·푸시로 나가지 않는다. 종을 봐야 안다
- 개인 레이어의 "나만 가는 곳" 은 순서 끝에 붙는다. 어디에 끼울지 고르는 화면이
  아직 없다
- `itinerary_personal`(옛 표)·`itineraries`(옛 표)는 쓰이지 않는다. 쓰던 배포 DB
  에 이미 있어 정의만 남겨 두었다


## 카드 연동은 왜 안 되나

카드사 거래내역 조회는 **마이데이터(본인신용정보관리업) 또는 오픈뱅킹 라이선스**가
있어야 하고, 개인이 카드번호로 조회하는 공개 API 는 없다.
그래서 카드번호 입력란을 일부러 만들지 않았고, CSV·문자 붙여넣기로 가져온다
(`lib/cardimport.ts`). 할 수 있는 다음 단계는 계정별로 **카드 별명 + 끝 4자리**만
등록해 두고, 가져온 내역을 끝 4자리로 주인에게 붙이는 것이다.
