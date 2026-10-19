import { fail, notFound, ok } from "@/lib/http";
import { guardTrip, needEdit } from "@/lib/guard";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trips/:id/draft — 설계 에이전트가 짠 하루 시간표.
 *
 *  지도 데이터가 없는 지역(지역팩이 없는 여행)은 이게 일정의 전부다.
 *  전에는 저장돼도 화면에 나올 길이 없었다. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const draft = await store.getDraft(id);
  return draft ? ok({ draft }) : notFound("초안");
}

/** DELETE — 초안을 버린다. 다시 짜게 하려고.
 *  공동의 일정이므로 보기만 하는 사람은 못 버린다. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  if (!g.ok) return g.res;
  const no = needEdit(g);
  if (no) return no;
  if (!store.dropDraft) return fail("unsupported", "지금 저장소는 초안 지우기를 지원하지 않습니다.", 501);
  const gone = await store.dropDraft(id);
  return gone ? ok({ deleted: id }) : notFound("초안");
}
