import { z } from "zod";
import { fail, notFound, ok, parse } from "@/lib/http";
import { store } from "@/lib/store";
import { dropPhoto } from "@/lib/blob";
import { guardTrip, needEdit } from "@/lib/guard";

export const dynamic = "force-dynamic";

const Patch = z.object({
  title: z.string().min(1).max(60).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  place: z.string().max(80).optional(),
  people: z.number().int().min(1).max(30).optional(),
  theme: z.string().max(20).optional(),
  region: z.string().nullable().optional(),
  /* 검색에 나올까. 주인만 바꾼다 — 아래 PATCH 에서 따로 막는다 */
  discoverable: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);
  return g.ok ? ok({ trip: g.trip }) : g.res;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);          // 남의 여행을 고치지 못하게
  if (!g.ok) return g.res;
  /* 보기만 하는 사람은 공동의 것을 못 고친다 */
  const no = needEdit(g);
  if (no) return no;
  const p = await parse(req, Patch);
  if (!p.ok) return p.res;
  /* 검색에 내놓는 것은 주인의 결정이다. editor 가 남의 여행을 세상에 열면 안 된다 */
  if (p.data.discoverable !== undefined && !g.canManage) {
    return fail("forbidden", "검색 노출은 여행 주인만 바꿀 수 있습니다.", 403);
  }
  const trip = await store.updateTrip(id, p.data);
  return trip ? ok({ trip }) : notFound("여행");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const g = await guardTrip(id);          // 남의 여행을 지우지 못하게
  if (!g.ok) return g.res;
  /* 지우는 것은 주인만. editor 가 남의 여행을 없앨 수 있으면 안 된다 */
  if (!g.canManage) return fail("forbidden", "여행 주인만 지울 수 있습니다.", 403);
  /* 여행을 지우면 사진 행은 DB 가 같이 지우지만(cascade) 저장소의 파일은 남는다.
     주소를 먼저 챙겨 두었다가 지운다 — 안 그러면 아무도 안 보는 파일이 쌓인다. */
  const urls = (await store.listPhotos(id)).map((p) => p.url);
  const gone = await store.deleteTrip(id);
  if (gone) await Promise.all(urls.map((u) => dropPhoto(u)));
  return gone ? ok({ deleted: id }) : fail("not_deletable", "기본 여행이거나 없는 여행입니다.", 409);
}
