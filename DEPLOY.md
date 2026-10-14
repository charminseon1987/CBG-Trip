# 배포 — 어디까지 했고 다음에 무엇을 하나

마지막 갱신 2026-10-14. **배포했다** — https://cbg-trip.vercel.app
Turso 가 붙은 것까지 확인했다(`/api/health` → `"store":"libsql"`).
남은 것은 관리자 자리 하나 — 아래 "지금 걸린 것" 을 먼저 읽을 것.

## 지금 걸린 것 — /setup 이 "이미 설정이 끝났다"고 한다

```
$ curl https://cbg-trip.vercel.app/api/auth/setup
{"ok":true,"data":{"needed":false,"codeRequired":true,"locked":false}}
                   ^^^^^^^^^^^^^^ 사용자가 0명이 아니다
```

`needed:false` 는 `users` 테이블에 행이 있다는 뜻이고, 그러면 `POST /api/auth/setup`
이 409 `already_setup` 으로 거절한다 — **`SETUP_CODE` 를 알아도 관리자를 못 만든다.**

누가 들어 있는지는 밖에서 알 수 없다. 로그인 실패 메시지가 "없는 계정" 과
"틀린 비밀번호" 를 구분하지 않기 때문이다(일부러 그렇게 만들었다).

알아낸 것:
- 이 배포가 **이 프로젝트의 첫 배포**다 (`vercel list` — 6분 전 하나뿐)
- 그러니 이 앱이 넣은 행이 아니다. Turso 스토어 `cbg-trip-db` 는 2026-10-12 에
  만들어졌으니, **붙이기 전부터 그 DB 에 뭔가 들어 있었던 것**으로 보인다
- 코드가 사용자를 자동으로 넣는 곳은 없다. `schema.ts` 에 INSERT 가 없고,
  `store-sql.ts` 의 자동 삽입은 여행(`HOME`) 하나뿐이다. 사용자를 만드는 곳은
  `auth.ts` 의 `createUser` 한 군데뿐이다

확인하는 길 (둘 중 하나):
1. https://cbg-trip.vercel.app/login 에서 **아는 계정으로 들어가 본다.**
   들어가지면 끝이다 — 그냥 예전 계정이 남아 있던 것이고, 그대로 쓰면 된다
2. Turso 대시보드에서 자격증명을 받아 직접 들여다본다 (아래 2단계와 같은 방법).
   `select id, email, name, role from users` 로 누구인지 본다

둘 다 아니면 Turso 에서 **데이터베이스를 새로 만들어 다시 붙이는 것**이 가장 깨끗하다.
어차피 지금은 옮긴 데이터가 없다.

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

아직 안 넣은 것: `ANTHROPIC_API_KEY`. 없으면 **냥이 채팅만** 멈춘다 —
일정·지도·가계부·사진·일기는 전부 돈다. 어차피 크레딧이 없어 지금은 넣을 게 없다.

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

### 2. 로컬 데이터 옮기기 — Turso 자격증명을 손으로 가져와야 한다

`webapp/data/trip.db` 에 여행 4개(에버랜드·엄마 여행·에이전트 검증·전주 검증)와
사용자 3·일정 2·사진 6·일기 1·지출 3 이 있다. Turso 는 빈 상태로 시작한다.

**안 옮기고 새로 시작해도 된다** — 에버랜드 여행은 코드가 자동으로 넣는다
(`HOME` in `store-sql.ts`). 가장 쉬운 길이다.

옮기려면 자격증명이 로컬에 있어야 하는데 Vercel 은 안 준다. **Turso 대시보드에서
직접 가져온다** — Vercel 프로젝트 > Storage > Turso > `Open in Turso` →
데이터베이스 > Database URL 과 새 토큰 발급. 받은 값을 `webapp/.env.turso` 에:

```
TURSO_DATABASE_URL=libsql://....turso.io
TURSO_AUTH_TOKEN=....
```

(`.env*` 는 `.gitignore` 에 있다. 그래도 커밋 전에 한 번 확인할 것)

그리고:

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
