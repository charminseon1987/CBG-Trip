# 배포 — 어디까지 했고 다음에 무엇을 하나

마지막 갱신 2026-10-16. **배포돼 있다** — https://cbg-trip.vercel.app
Turso 가 붙은 것까지 확인했다(`/api/health` → `"store":"libsql"`).

올리는 법: `cd webapp && npx vercel deploy --prod`.
프리뷰(`npx vercel deploy`)는 Vercel 인증에 막혀 있어 브라우저로 바로 못 본다 —
`npx vercel curl /api/health --deployment <주소>` 로 두드린다. Git Bash 에서는
`export MSYS_NO_PATHCONV=1` 을 먼저 해야 경로가 안 깨진다.

2026-10-16 에 올린 것: 함께 탭(멤버·초대 링크 상시 표시) · 회원가입(코드 없이) ·
권한 구멍 수정 · 여러 날 여행(일정 날짜별·가계부 날짜·사진 날짜별 장소) ·
사진 공개 범위(기본 나만 보기) · 검색→신청→승인 · 대화(그룹 + 일대일 + 여행 카드).

## 다른 컴퓨터에서 이어서 하기 (맥북)

git 에 안 올라가는 것이 다섯 가지다. 코드만 받아서는 안 돈다.

```bash
git clone https://github.com/charminseon1987/CBG-Trip.git
cd CBG-Trip/webapp && npm install
```

1. **Vercel 연결** (`webapp/.vercel/`)
   ```bash
   npx vercel login        # charminseon1987
   npx vercel link         # 기존 프로젝트 cbg-trip 을 고른다
   ```
2. **배포 환경변수** — 값은 Vercel 에만 있다. 내려받는다:
   ```bash
   npx vercel env pull .env.production.local --environment=production
   ```
   `sensitive` 타입(TURSO_*·BLOB_READ_WRITE_TOKEN)은 값이 빈 문자열로 온다.
   그건 원래 안 내려온다 — 배포된 런타임 안에서만 보인다.
3. **로컬 개발용 `webapp/.env.local`** — 직접 만든다. 최소한 이것만 있으면 된다:
   ```
   DATABASE_URL=file:./data/trip.db
   ```
   모델을 쓰려면 `AGENT_PROVIDER`·`AGENT_BASE_URL`·`AGENT_API_KEY`
   (또는 `ANTHROPIC_API_KEY` + `ANTHROPIC_WORKSPACE_ID`) 를 더한다.
   `.env.example` 에 이름이 다 있다.
4. **로컬 DB** (`webapp/data/trip.db`) — 안 가져가도 된다. 비어 있으면 첫 요청에
   표가 만들어지고 `/setup` 으로 관리자를 만든다(`SETUP_CODE` 없이 로컬에서는 된다).
   윈도우 기계의 것을 쓰고 싶으면 그 파일만 복사한다. 비밀번호는 로컬과 배포가
   다르니 `node scripts/set-local-password.mjs <메일> <새비번>` 으로 정한다.
5. **`webapp/.env.turso`** — 안 가져가도 된다. 그리고 이건 **프로덕션 DB 가 아니다**
   (같은 데이터가 든 별개 DB). 배포본 확인은 앱의 API 로 한다.

로컬에서 띄우기:
```bash
cd webapp && npm run build && npx next start -p 3100
```
맥에서는 포트를 `lsof -ti:3100 | xargs kill -9` 로 비운다
(윈도우의 `Get-NetTCPConnection` 자리).

## 관리자 자리 — 풀렸다

배포 직후 `/api/auth/setup` 이 `needed:false` 를 돌려줘서 "관리자를 못 만든다"고 적었었다.
Turso 를 직접 열어 보니 이유가 나왔다 — **로컬 `trip.db` 가 이미 통째로 들어가 있었다.**

| 테이블 | 행 |
|---|---|
| users | 3 (`admin@trip.local` 관리자 · `mom@trip.local` 엄마 · `dad@trip.local` 아빠) |
| trips | 4 (에버랜드 · 엄마 여행 · 에이전트 검증 · 전주 검증) |
| itineraries · photos · diaries · expenses | 2 · 6 · 1 · 3 |
| sessions · drafts | 0 |

로컬 DB 와 수가 정확히 같다. 즉 **4단계(데이터 이전)는 이미 끝나 있다.**
`/setup` 이 거절한 건 고장이 아니라 제대로 도는 것이다 — 관리자가 이미 있으니까.

그러니 `/setup` 이 아니라 **`/login` 으로 들어간다**:

    https://cbg-trip.vercel.app/login
    admin@trip.local  +  개발하며 정한 비밀번호 (2026-10-03 에 만든 계정)

비밀번호가 기억나지 않으면 — 되찾는 길은 없다(메일 발송이 없다). `.env.turso`
자격증명으로 `users.password_hash` 를 직접 갈아 끼우면 된다. scrypt 해시 꼴은
`src/lib/auth.ts` 참고.

사진 6장은 전부 data URI 지만 24~267자짜리 시험용이다 — 진짜 사진이 아니라서
4.5MB 한도 문제는 아직 없다. 앞으로 올리는 사진은 Blob 으로 간다
(`BLOB_READ_WRITE_TOKEN` 이 Production 에 들어 있다).

### Turso 를 직접 들여다보려면

**주의 (2026-10-16 에 알아낸 것): `webapp/.env.turso` 가 가리키는 DB 는
프로덕션이 쓰는 DB 가 아니다.** 같은 가족 데이터(사람 3·여행 4·사진 6)가 들어
있지만 마이그레이션이 한 번도 안 들어간 별개 DB 다. 이걸로 "배포본에 표가
생겼나" 를 확인하면 엉뚱한 답을 얻는다 — 확인은 배포된 앱의 API 로 한다.
프리뷰 배포는 또 다른 분기(branch) DB 를 쓴다.

`webapp/.env.turso` 에 자격증명을 받아 뒀다 (git 에 안 올라간다).
받은 곳: Vercel > cbg-trip > 왼쪽 사이드바 **Storage** > `cbg-trip-db`
> Quickstart 상자의 **Copy Snippet**. (Turso 대시보드까지 갈 것 없다)

가는 길은 **Turso(DB) + Vercel Blob(사진) + 직접 만든 카카오 로그인**이다.
Supabase 도 재 봤는데 — 카카오 로그인이 내장이고 Storage 도 있어서 끌렸지만 —
무료 플랜이 **1주일 안 쓰면 프로젝트가 멈춘다**. 여행 앱은 여행 전후에만 쓰니
자주 멈춘다. 그리고 Supabase Auth 로 갈아타면 이미 13개 공격 경로를 막는 것까지
확인한 인증 코드를 버려야 한다. 그래서 Turso 로 갔다.

## 끝난 것

- Vercel 로그인 — `charminseon1987`
- Vercel 프로젝트 **cbg-trip** 생성·연결 (`webapp/.vercel/`, git 에는 안 올라간다)
- **Turso 붙였다** — `TURSO_DATABASE_URL`·`TURSO_AUTH_TOKEN` (Preview·Production)
- **Blob 붙였다** — `BLOB_READ_WRITE_TOKEN`·`BLOB_STORE_ID`·`BLOB_WEBHOOK_PUBLIC_KEY`
- **`SETUP_CODE` 넣었다** (Production 에만)
- 코드는 전부 준비됐다. `npx next build` 통과한다 (2026-10-14 확인)

### 모델은 일부러 안 붙였다 (2026-10-14 결정)

배포본에서 **냥이 채팅만 안 된다.** 일정·지도·가계부·사진·일기는 전부 돈다.
`ANTHROPIC_API_KEY` 를 Vercel 에 안 넣었기 때문인데, 넣어도 지금은 소용없다.

`webapp/.env.local` 의 키를 재 봤다:

| 확인한 것 | 결과 |
|---|---|
| 키가 살아 있나 | ✅ `GET /v1/models` → 200 |
| 크레딧 | ❌ `Your credit balance is too low to access the Anthropic API.` |
| 앱이 워크스페이스 헤더를 보내나 | ✅ `provider.ts:24` |

이 키는 `sk-ant-usr-…` 꼴이라 **워크스페이스에 안 묶여 있다**. `ANTHROPIC_API_KEY`
하나만 넣으면 400 이 난다 — `ANTHROPIC_WORKSPACE_ID` 를 **반드시 같이** 넣어야 한다.
코드는 이미 그렇게 짜여 있으니, **크레딧만 채우면 두 변수 넣고 재배포로 끝난다.**

**Ollama 는 배포에 못 쓴다.** 로컬(`.env.local` 의 `AGENT_PROVIDER=ollama`)에서만
쓴다. `OLLAMA_BASE_URL` 이 설정 가능해서 터널로 이 컴퓨터를 물리는 것은 되지만,
이 기계엔 GPU 가 없어 0.1–3.4 tok/s 이고 컴퓨터가 꺼지면 사이트도 멈춘다. 안 한다.

`AGENT_PROVIDER` 는 Vercel 에 안 넣어도 된다 — 기본값이 `anthropic` 이다.

## 가장 먼저 알아야 할 것 — 배포 비밀은 내려받을 수 없다

마켓플레이스가 넣어 준 변수는 Vercel 에서 `type=sensitive` 다.
**Vercel 이 아무에게도 값을 돌려주지 않는다** — `vercel env pull` 을 해도
이름만 오고 값은 빈 문자열(`""`)이다. 대시보드에서도 안 보인다.

```
$ vercel env pull .env.production.local --environment=production
$ grep TURSO .env.production.local
TURSO_AUTH_TOKEN=""
TURSO_DATABASE_URL=""      ← 설정이 안 된 게 아니다. 원래 안 내려온다
```

확인하는 법 (`type` 을 보면 된다):

```
vercel api "/v10/projects/<projectId>/env?teamId=<teamId>" --method GET
```

| 변수 | type | 내려받히나 |
|---|---|---|
| `SETUP_CODE` | encrypted | **된다** (우리가 넣은 것) |
| `BLOB_STORE_ID` | plain | 된다 |
| `BLOB_READ_WRITE_TOKEN` | sensitive | 안 된다 |
| `TURSO_DATABASE_URL`·`TURSO_AUTH_TOKEN` | sensitive | 안 된다 |

값은 **배포된 런타임 안에서만** 보인다. 그래서 아래 두 가지가 달라진다.

## 다음에 할 것

### 1. 배포해서 거기서 확인한다 (로컬로는 못 한다)

"로컬에서 프로덕션 값으로 먼저 돌려 본다"는 **버렸다.** 위 이유로 불가능하다.
대신 배포한 뒤 배포된 주소에서 확인한다.

```
cd webapp
vercel deploy          # 프리뷰. 먼저 이걸로 본다
vercel deploy --prod   # 프로덕션
```

프리뷰에는 `SETUP_CODE` 가 없다(Production 에만 넣었다). 그래서 프리뷰에서는
`/setup` 이 잠겨 관리자를 못 만든다 — **DB 가 진짜 붙었는지는 프로덕션에서만
끝까지 확인된다.** 프리뷰에서 볼 수 있는 데까지는:

- `GET /api/health` → `"store": "libsql"` 이어야 한다.
  `"memory"` 가 나오면 `TURSO_DATABASE_URL` 을 못 읽은 것이다
  (`src/db/client.ts` 의 `dbUrl()` 이 `TURSO_*` 도 읽는지 확인 — 이 지원이
  없던 시절 코드로 배포하면 조용히 메모리로 떨어진다)

프로덕션에 올린 뒤 **바로** `/setup` 에 `SETUP_CODE` 로 관리자를 만든다.
이게 되면 Turso 에 글이 써진 것이다 — 그게 진짜 확인이다.
그 다음 사진 한 장을 올려 본다. DB 에 `https://...blob.vercel-storage.com/...`
가 적히면 Blob 도 붙은 것이고, `data:` 로 시작하면 토큰이 안 들어온 것이다.

### 2. 로컬 데이터 옮기기 — **이미 끝났다**

Turso 를 열어 보니 `webapp/data/trip.db` 의 내용이 그대로 들어가 있었다
(위 "관리자 자리" 참고). 아래는 **다시 옮길 일이 생겼을 때**를 위해 남긴다.

자격증명은 `webapp/.env.turso` 에 있다. 없으면 Vercel > cbg-trip > Storage >
`cbg-trip-db` > Quickstart 의 **Copy Snippet** 으로 다시 받는다.

```
cd webapp
node scripts/migrate-to-turso.mjs --env=.env.turso                        # 마른 실행
node scripts/migrate-to-turso.mjs --env=.env.turso --apply                # 실제로
node scripts/migrate-to-turso.mjs --env=.env.turso --apply --photos=blob  # 사진도 Blob 으로
```

- `--apply` 없이는 **한 줄도 쓰지 않는다**. 먼저 마른 실행으로 표를 보고 판단할 것
- 여러 번 돌려도 안전하다 — 이미 간 행은 건너뛴다
- 받는 쪽을 로컬 값으로 되돌리려면 `--replace`. 지우지 않고 덮어쓰므로(upsert)
  **받는 쪽에만 있던 행은 살아남는다**. `INSERT OR REPLACE` 로 쓰면 cascade 가
  딸린 사진·일기를 지워 버린다 — 그래서 안 쓴다 (스크립트 머리말에 적어 뒀다)
- 테이블 DDL 은 보내는 쪽 `sqlite_master` 에서 읽어 만든다. `schema.ts` 와 엇갈리지 않는다
- **세션은 안 옮긴다** (로그인 토큰). 배포한 주소에서 새로 로그인하면 된다
- `--photos=blob` 은 `BLOB_READ_WRITE_TOKEN` 이 필요하다. 이것도 sensitive 라
  내려받을 수 없다 — Vercel > Storage > Blob 에서 직접 복사해 같은 파일에 넣을 것

시험은 로컬 파일 DB 를 받는 쪽으로 두고 돌려 봤다 — 7개 테이블이 값까지 같고,
두 번 돌려도 19행을 건너뛰며, `--replace` 가 받는 쪽에만 있던 사진을 지키는 것까지 확인했다.
**진짜 Turso 로는 아직 못 돌려 봤다.**

### 3. 그 다음 (아직 손 안 댐)

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
- **`.env.local` 이 배포 값을 가린다.** Next.js 는 `.env.production.local` 을 먼저,
  거기 없는 이름만 `.env.local` 에서 읽는다. 그런데 `.env.local` 에는
  `DATABASE_URL=file:./data/trip.db` 가 있고 `src/db/client.ts` 의 `dbUrl()` 은
  `DATABASE_URL` 을 `TURSO_DATABASE_URL` 보다 먼저 본다 — 그래서 로컬에서
  `next start` 로 "프로덕션처럼" 돌리면 **조용히 로컬 파일 DB 를 쓴다**.
  배포에는 `.env.local` 이 없으니 이 함정은 로컬에만 있다
