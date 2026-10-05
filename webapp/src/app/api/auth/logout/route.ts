import { cookies } from "next/headers";
import { ok } from "@/lib/http";
import { COOKIE, destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await destroySession(token).catch(() => {});
  jar.delete(COOKIE);
  return ok({ loggedOut: true });
}
