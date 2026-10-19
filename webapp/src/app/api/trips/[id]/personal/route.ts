import { z } from "zod";
import { fail, ok, parse } from "@/lib/http";
import { guardTrip } from "@/lib/guard";
import { DATE_RE } from "@/lib/days";
import { getLayer, putLayer } from "@/lib/personal";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/* 내 개인 레이어. needEdit 을 부르지 않는다 — 공동의 것이 아니라 내 것이다.
   보기만 하는 사람도 자기 하루는 꾸민다. 남의 레이어는 볼 수도 고칠 수도 없다
   (늘 내 것만 읽고 쓴다). */

/** GET /api/trips/:id/personal?date=YYYY-MM-DD */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.user) return fail("unauthorized", "로그인이 필요합니다.", 401);

  const want = new URL(req.url).searchParams.get("date");
  const date = want && DATE_RE.test(want) ? want : g.trip.date;
  return ok({ date, layer: await getLayer(id, g.user.id, date) });
}

const Body = z.object({
  date: z.string().regex(DATE_RE).optional(),
  dropped: z.array(z.string().max(60)).max(60).optional(),
  added: z.array(z.string().max(60)).max(60).optional(),
  /** 내 출발 시각. null 로 보내면 공동 것을 따른다 */
  start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

/** PUT — 내 레이어를 덮어쓴다 */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  if (!g.user) return fail("unauthorized", "로그인이 필요합니다.", 401);

  const p = await parse(req, Body);
  if (!p.ok) return p.res;
  const date = p.data.date ?? g.trip.date;
  const layer = await putLayer(id, g.user.id, date, {
    dropped: p.data.dropped,
    added: p.data.added,
    start: p.data.start,
  });
  return ok({ date, layer });
}
