/* ============================================================
   여행 하위 라우트의 출입 검사.

   /api/trips/:id/* 는 전부 "이 사람이 이 여행을 볼 수 있는가" 를 먼저 묻는다.
   id 만 알면 남의 여행이 열리던 구멍을 막는다.

   없는 여행과 권한 없는 여행을 모두 404 로 돌려준다 —
   403 을 주면 "그 id 는 있다" 는 사실이 새어 나간다.
   ============================================================ */
import { currentUser, type User } from "./auth";
import { fail, notFound } from "./http";
import { hasDb } from "@/db/client";
import * as members from "./members";
import { store } from "./store";
import type { Trip } from "./types";

export type Guard =
  | {
      ok: true;
      trip: Trip;
      user: User | null;
      /** 이 여행에서의 내 권한. 기본 여행이거나 메모리 구현이면 null */
      role: members.TripRole | null;
      /** 공동의 것(일정·가계부·여행 정보)을 고칠 수 있나 */
      canEdit: boolean;
      /** 사람을 들이고 내보낼 수 있나 — 주인만 */
      canManage: boolean;
    }
  | { ok: false; res: ReturnType<typeof notFound> };

export async function guardTrip(tripId: string): Promise<Guard> {
  const user = await currentUser();
  const trip = await store.getTrip(tripId);
  if (!trip) return { ok: false, res: notFound("여행") };

  /* 메모리 구현에는 멤버 표가 없다. 그때는 예전 판정만 쓰고 "볼 수 있으면
     고칠 수 있다" 로 둔다 — DB 없이 도는 건 혼자 써 보는 상태다. */
  if (!hasDb()) {
    if (store.canSee && !(await store.canSee(tripId, user))) {
      return { ok: false, res: notFound("여행") };
    }
    return { ok: true, trip, user, role: null, canEdit: true, canManage: false };
  }

  if (!(await members.canSee(tripId, user))) {
    return { ok: false, res: notFound("여행") };
  }
  return {
    ok: true, trip, user,
    role: user ? await members.roleOf(tripId, user.id) : null,
    canEdit: await members.canEdit(tripId, user),
    canManage: await members.canManage(tripId, user),
  };
}

/** 고칠 권한이 없으면 403. 보는 것은 이미 통과했으니 존재를 숨길 이유가 없다 */
export const needEdit = (g: Extract<Guard, { ok: true }>) =>
  g.canEdit ? null : fail("read_only", "이 여행에서는 보기만 할 수 있습니다.", 403);
