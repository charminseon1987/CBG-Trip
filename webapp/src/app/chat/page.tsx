import { redirect } from "next/navigation";
import ChatRooms from "@/components/ChatRooms";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* /chat — 내 대화가 모이는 자리.

   미들웨어가 쿠키 없는 사람을 /login 으로 보내지만, 쿠키가 죽어 있을 수도
   있어 여기서 한 번 더 본다 (미들웨어는 Edge 에서 돌아 DB 를 못 본다). */
export default async function ChatPage() {
  const me = await currentUser();
  if (!me) redirect("/login?next=/chat");
  return <ChatRooms />;
}
