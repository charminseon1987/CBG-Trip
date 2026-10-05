/* ============================================================
   여행 하위 라우트의 출입 검사.

   /api/trips/:id/* 는 전부 "이 사람이 이 여행을 볼 수 있는가" 를 먼저 묻는다.
   id 만 알면 남의 여행이 열리던 구멍을 막는다.

   없는 여행과 권한 없는 여행을 모두 404 로 돌려준다 —
   403 을 주면 "그 id 는 있다" 는 사실이 새어 나간다.
   ============================================================ */
import { currentUser, type User } from "./auth";
import { notFound } from "./http";
import { store } from "./store";
import type { Trip } from "./types";

export type Guard =
  | { ok: true; trip: Trip; user: User | null }
  | { ok: false; res: ReturnType<typeof notFound> };

export async function guardTrip(tripId: string): Promise<Guard> {
  const user = await currentUser();
  const trip = await store.getTrip(tripId);
  if (!trip) return { ok: false, res: notFound("여행") };

  if (store.canSee && !(await store.canSee(tripId, user))) {
    return { ok: false, res: notFound("여행") };
  }
  return { ok: true, trip, user };
}
