# 배포 — 어디까지 했고 다음에 무엇을 하나

마지막 갱신 2026-10-08. **아직 배포하지 않았다.** 준비만 해 두었다.

가는 길은 **Turso(DB) + Vercel Blob(사진) + 직접 만든 카카오 로그인**이다.
Supabase 도 재 봤는데 — 카카오 로그인이 내장이고 Storage 도 있어서 끌렸지만 —
무료 플랜이 **1주일 안 쓰면 프로젝트가 멈춘다**. 여행 앱은 여행 전후에만 쓰니
자주 멈춘다. 그리고 Supabase Auth 로 갈아타면 이미 13개 공격 경로를 막는 것까지
확인한 인증 코드를 버려야 한다. 그래서 Turso 로 갔다.

## 끝난 것

- Vercel 로그인 — `charminseon1987`
- Vercel 프로젝트 **cbg-trip** 생성·연결 (`webapp/.vercel/`, git 에는 안 올라간다)
- 코드는 전부 준비됐다. 환경 변수만 넣으면 그대로 돈다

## 다음에 할 것

### 1. 저장소 두 개 붙이기 (브라우저, 사람이 해야 함)

https://vercel.com/charminseon1987s-projects/cbg-trip/stores

- `Create Database` → 마켓플레이스 **Turso** → Free → 연결
  → `DATABASE_URL`·`DATABASE_TOKEN` 이 자동으로 들어간다
- `Create` → **Blob**
  → `BLOB_READ_WRITE_TOKEN` 이 자동으로 들어간다

결제 동의가 필요해 CLI 로는 못 한다. Turso CLI 는 필요 없다 —
Windows 에서는 WSL 이 있어야 하는데 이 기계엔 없고(`REGDB_E_CLASSNOTREG`),
마켓플레이스로 붙이면 CLI 없이 된다.

### 2. 손으로 넣어야 하는 환경 변수

마켓플레이스가 안 넣어 주는 것들이다. Vercel 대시보드 > Settings > Environment Variables.

| 변수 | 값 | 없으면 |
|---|---|---|
| `SETUP_CODE` | 길게 아무거나 정한 비밀 | `/setup` 이 **아예 잠긴다** (의도된 동작) |
| `AGENT_PROVIDER` | `anthropic` | 기본값이 anthropic 이라 생략 가능 |
| `ANTHROPIC_API_KEY` | 키 | 냥이 채팅만 멈추고 나머지는 돈다 |
| `ANTHROPIC_WORKSPACE_ID` | 조직 키일 때만 | — |
| `DATA_GO_KR_KEY` | 기상청 키 (선택) | 에버랜드 자체 날씨로 넘어간다 |

`AGENT_PROVIDER=ollama` 는 **절대 넣지 말 것** — Ollama 는 localhost 라 Vercel 엔 없다.

### 3. 로컬에서 먼저 돌려 보기

```
cd webapp
vercel env pull .env.local      # Turso·Blob 값이 로컬로 내려온다
npx next build && npx next start -p 3100
```

확인할 것:
- 사진을 올리면 DB 에 `https://...blob.vercel-storage.com/...` 가 적히는가
  (data URI 가 적히면 토큰이 안 들어온 것이다)
- 여행 목록·일정·일기가 뜨는가 (Turso 에 테이블이 새로 만들어진다)

### 4. 지금 로컬 데이터 옮기기

`webapp/data/trip.db` 에 여행 4개(에버랜드·경주·엄마 여행·전주)와 사진·일기가 있다.
Turso 는 빈 상태로 시작하므로 옮기려면 스크립트가 필요하다. **아직 안 만들었다.**
안 옮기고 새로 시작해도 된다 — 에버랜드 여행은 코드가 자동으로 넣는다(`HOME` in `store-sql.ts`).

### 5. 배포

```
cd webapp
vercel --prod
```

배포 직후 **바로** `https://<주소>/setup` 에 들어가 `SETUP_CODE` 로 관리자를 만들 것.

### 6. 그 다음 (아직 손 안 댐)

- **카카오 로그인** — 배포 주소가 정해져야 리다이렉트 URI 를 넣을 수 있다.
  developers.kakao.com 에서 앱 등록 → REST API 키·Client Secret →
  리다이렉트 URI `https://<주소>/api/auth/kakao/callback`.
  코드 쪽은 `users` 테이블에 `kakao_id` 열 하나와 라우트 하나면 된다.
- **일정별 친구 공유** — 두 갈래 중 아직 안 골랐다.
  (가) 비밀 링크 — 쉽고, 링크가 새면 누구나 본다
  (나) 친구 초대 — 카카오 로그인한 사람을 멤버로. 통제되고 같이 고칠 수 있다
- **계정별 카드 등록** — 별명 + 끝 4자리만. 카드번호는 받지 않는다 (CLAUDE.md 참고)

## 배포하면 달라지는 것

| | 로컬 | 배포 |
|---|---|---|
| DB | `file:./data/trip.db` | Turso |
| 사진 | data URI 로 DB 에 | Blob 에 파일, DB 엔 주소 |
| 모델 | Ollama (GPU 없어 느림) | Anthropic |
| `/setup` | 코드 없이 됨 | `SETUP_CODE` 필수 |

## 걸려 넘어질 만한 것

- **사진은 토큰 없이 배포하면 안 된다.** 재 보니 480KB 사진 한 장이 DB 에
  655,383자로 들어간다. 일곱 장이면 응답이 Vercel 한도(4.5MB)를 넘겨
  사진 탭이 통째로 안 열린다
- **Blob 업로드는 진짜 토큰으로 아직 확인 못 했다.** 가짜 토큰으로
  "요청이 Vercel Blob 까지 가고 실패하면 502 를 돌려준다" 까지만 봤다
- **에이전트는 Anthropic 크레딧이 있어야 한다.** 없으면 냥이 채팅이 멈춘다.
  일정·지도·가계부·사진·일기는 모델 없이도 전부 돈다
