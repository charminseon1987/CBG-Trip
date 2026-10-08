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

## 지금 상태 (2026-10-08)

된 것
- **DB** — libSQL/SQLite. `DATABASE_URL` 이 있으면 `SqlStore`, 없으면 메모리.
  테이블 8개(users·sessions·trips·itineraries·photos·diaries·expenses·drafts).
  마이그레이션 도구 없이 `CREATE_SQL`·`PATCH_SQL` 로 첫 요청에 만든다
- **인증** — scrypt + 세션 쿼키. `guardTrip()` 으로 남의 여행은 404 (403 은 존재를 알린다).
  13개 공격 경로를 다른 계정으로 쳐서 전부 막히는 것을 확인했다
- **첫 관리자** — `SETUP_CODE` 를 아는 사람만. 코드 없이 배포하면 `/setup` 이 잠긴다
- **레이트 리밋** — 모델을 부르는 두 길에 사람당 분당 10번
- **사진** — `lib/blob.ts`. `BLOB_READ_WRITE_TOKEN` 이 있으면 Vercel Blob,
  없으면 data URI (로컬). 진짜 토큰으로는 아직 확인 못 했다
- **일기** — 그날 사진을 장면으로 묶어 손글씨 스크랩북. 모델 45초, 넘기면 규칙이 쓴다
- **장소 상세** — 일정 카드·지도 핸을 누르면 특징·사진·역사.
  경주 20곳 중 사진 17·역사 7, 에버랜드 30곳 중 사진 5 (어트랙션은 위키백과에 항목이 없다)

안 된 것
- **배포 안 했다.** Vercel 프로젝트만 만들어 연결해 두었다 — DEPLOY.md 참고
- 카카오 로그인 없음 · 친구 공유 없음 · 계정별 카드 등록 없음
- 설계 초안은 아직 메모리 `Map` 이다 (drafts 테이블로 옮겨야 한다)
- Anthropic 키는 있으나 **크레딧 부족**으로 호출이 막혔 있다.
  그래서 로컬은 Ollama 로 돌리는데, 이 기계엔 GPU 가 없어 느리다

## 카드 연동은 왜 안 되나

카드사 거래내역 조회는 **마이데이터(본인신용정보관리업) 또는 오픈뱅킹 라이선스**가
있어야 하고, 개인이 카드번호로 조회하는 공개 API 는 없다.
그래서 카드번호 입력란을 일부러 만들지 않았고, CSV·문자 붙여넣기로 가져온다
(`lib/cardimport.ts`). 할 수 있는 다음 단계는 계정별로 **카드 별명 + 끝 4자리**만
등록해 두고, 가져온 내역을 끝 4자리로 주인에게 붙이는 것이다.
