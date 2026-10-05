/* 쿠키 이름만 담은 모듈.
   미들웨어는 Edge 에서 돌아 node:fs 같은 것을 못 쓴다 — auth.ts 를 통째로
   가져오면 DB 클라이언트까지 딸려 와서 빌드가 깨진다. 그래서 이것만 떼어 둔다. */
export const COOKIE = "trip_session";
