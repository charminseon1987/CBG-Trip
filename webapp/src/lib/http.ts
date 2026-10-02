/* REST 응답 봉투 — 모든 라우트가 같은 모양으로 답한다.
   성공 { ok: true, data } · 실패 { ok: false, error: { code, message } } */
import { NextResponse } from "next/server";
import type { ZodError, ZodTypeAny, infer as ZInfer } from "zod";

export const ok = <T>(data: T, init?: ResponseInit) =>
  NextResponse.json({ ok: true, data }, init);

export const fail = (code: string, message: string, status = 400) =>
  NextResponse.json({ ok: false, error: { code, message } }, { status });

/** 받침이 있으면 "을", 없으면 "를" */
const particle = (w: string) => {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "을";
  return (c - 0xac00) % 28 ? "을" : "를";
};
export const notFound = (what = "리소스") =>
  fail("not_found", `${what}${particle(what)} 찾지 못했습니다.`, 404);

export const badRequest = (e: ZodError) =>
  fail("invalid_input", e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join(" · "), 422);

/** 본문을 읽고 스키마로 검증한다 */
export async function parse<S extends ZodTypeAny>(req: Request, schema: S): Promise<
  { ok: true; data: ZInfer<S> } | { ok: false; res: ReturnType<typeof fail> }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: fail("invalid_json", "JSON 본문을 읽지 못했습니다.", 400) };
  }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, res: badRequest(r.error) };
  return { ok: true, data: r.data };
}
