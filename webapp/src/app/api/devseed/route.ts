// 미리보기 전용 임시 라우트 — 커밋하지 않는다
import { store } from "@/lib/store";
import type { Diary } from "@/lib/types";
export async function POST(req: Request) {
  const d = (await req.json()) as Diary;
  await store.putDiary(d);
  return Response.json({ ok: true });
}
