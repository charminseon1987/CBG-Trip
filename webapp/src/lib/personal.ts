/* ============================================================
   개인 레이어 — "난 여긴 빼고 저긴 갈게".

   같이 가도 똑같이 움직이지는 않는다. 아이는 사파리에서 더 놀고 어른은
   먼저 나오고, 누구는 박물관을 건너뛴다. 그걸 공동 일정에 넣을 수는 없다 —
   공동 일정은 다 같이 보는 하나여야 한다.

   일정 사본을 떠 주지 않는다. 사본은 뜨는 순간 갈라져서, 주인이 공동 일정을
   고쳐도 친구에게는 영영 안 간다. 대신 **차이만** 적어 둔다 —
     dropped  그 날 공동 일정에서 뺄 곳
     added    공동 일정에 없지만 내가 갈 곳
     start    내 출발 시각 (NULL 이면 공동 것)
   그러면 공동 일정이 바뀌어도 내 수정이 그 위에 그대로 얹힌다.

   보기만 하는 사람(viewer)도 자기 레이어는 고친다. 공동의 것을 못 고치는 것과
   자기 하루를 못 꾸미는 것은 다른 얘기다.
   ============================================================ */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export interface Layer {
  dropped: string[];
  added: string[];
  start: string | null;
}

export const EMPTY: Layer = { dropped: [], added: [], start: null };

/** 아무것도 안 바꾼 레이어인가 — 비어 있으면 계산도 화면도 건너뛴다 */
export const isEmpty = (l: Layer) =>
  !l.dropped.length && !l.added.length && !l.start;

async function conn() {
  const c = getDb();
  if (!c) throw new Error("DB 가 없어 개인 일정을 쓸 수 없습니다.");
  await c.ready;
  return c.db;
}

export async function getLayer(
  tripId: string, userId: string, date: string,
): Promise<Layer> {
  const db = await conn();
  const r = await db.select({
    dropped: schema.personalDays.dropped,
    added: schema.personalDays.added,
    start: schema.personalDays.start,
  })
    .from(schema.personalDays)
    .where(and(
      eq(schema.personalDays.tripId, tripId),
      eq(schema.personalDays.userId, userId),
      eq(schema.personalDays.date, date),
    ))
    .limit(1);
  const row = r[0];
  if (!row) return { ...EMPTY };
  return {
    dropped: row.dropped ?? [],
    added: row.added ?? [],
    start: row.start ?? null,
  };
}

/** 여행 전체에서 내가 손댄 날들 — 날짜 띠에 표시하는 데 쓴다 */
export async function myTouchedDates(tripId: string, userId: string): Promise<string[]> {
  const db = await conn();
  const rows = await db.select({
    date: schema.personalDays.date,
    dropped: schema.personalDays.dropped,
    added: schema.personalDays.added,
    start: schema.personalDays.start,
  })
    .from(schema.personalDays)
    .where(and(
      eq(schema.personalDays.tripId, tripId),
      eq(schema.personalDays.userId, userId),
    ));
  return rows
    .filter((r) => (r.dropped?.length || r.added?.length || r.start))
    .map((r) => r.date);
}

export async function putLayer(
  tripId: string, userId: string, date: string, patch: Partial<Layer>,
): Promise<Layer> {
  const db = await conn();
  const cur = await getLayer(tripId, userId, date);
  const next: Layer = {
    dropped: patch.dropped ?? cur.dropped,
    added: patch.added ?? cur.added,
    start: patch.start === undefined ? cur.start : patch.start,
  };
  /* 같은 곳을 빼면서 넣을 수는 없다 — 넣은 쪽을 남긴다 */
  next.dropped = next.dropped.filter((id) => !next.added.includes(id));

  const row = {
    tripId, userId, date,
    dropped: next.dropped, added: next.added, start: next.start,
    updatedAt: new Date().toISOString(),
  };
  await db.insert(schema.personalDays).values(row)
    .onConflictDoUpdate({
      target: [schema.personalDays.tripId, schema.personalDays.userId, schema.personalDays.date],
      set: { dropped: row.dropped, added: row.added, start: row.start, updatedAt: row.updatedAt },
    });
  return next;
}

/** 공동 순서에 내 레이어를 얹어 내 순서를 만든다.
 *
 *  added 는 뒤에 붙인다. 어디에 끼울지는 계산이 정할 일이 아니라 사람이 정할
 *  일인데 지금은 그 화면이 없다 — 뒤에 붙여 두면 적어도 빠지지는 않는다. */
export function applyLayer(shared: string[], layer: Layer): string[] {
  const kept = shared.filter((id) => !layer.dropped.includes(id));
  const extra = layer.added.filter((id) => !kept.includes(id));
  return [...kept, ...extra];
}
