import { ok } from "@/lib/http";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({ user: await currentUser() });
}
