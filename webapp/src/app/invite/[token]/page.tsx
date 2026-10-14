import InviteCard from "@/components/InviteCard";

export const dynamic = "force-dynamic";

/* 초대 링크가 닿는 곳.

   로그인 안 한 사람은 미들웨어가 /login?next=/invite/<토큰> 으로 보내고,
   들어오면 여기로 돌아온다 — 카카오 단추도 그 next 를 달고 간다.

   여기서 바로 멤버로 만들지 않는다. 카카오톡·메신저가 링크를 미리 열어 보기
   때문에, 사람이 누르기도 전에 초대장이 소모된다. 단추를 눌러야 POST 가 간다. */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteCard token={token} />;
}
