/* 사진을 누구에게 보여 줄까.

   사진은 공동의 것이 아니라 올린 사람의 것이다. 그래서 기본은 "나만 보기" 다 —
   올린 사람이 골라서 공개한다. 거르는 자리를 한 곳이라도 빠뜨리면 남의 "나만
   보기" 가 새어 나가므로, 앨범·일기·에이전트가 모두 이 두 함수만 쓴다.

   store.listPhotos 는 거르지 않은 채로 남겨 둔다 — 여행을 지울 때 저장소의
   파일 주소를 전부 모아야 하기 때문이다. 그 길은 사람에게 보여 주는 길이 아니다. */
import { store } from "./store";
import type { Photo } from "./types";

/** 이 사람에게 보이는 사진. "나만 보기" 는 올린 사람에게만 보인다.
 *
 *  여행 주인에게도 남의 "나만 보기" 는 안 보인다 — 그게 "나만" 의 뜻이다.
 *  (보이는 사진을 치울 수 있는지는 라우트가 따로 판정한다) */
export async function visiblePhotos(
  tripId: string, viewerId: string | null,
): Promise<Photo[]> {
  const all = await store.listPhotos(tripId);
  return all.filter(
    (p) => p.visibility !== "private" || (!!viewerId && p.userId === viewerId),
  );
}

/** 같이 보는 사진만. 공동의 것을 만들 때 쓴다.
 *
 *  일기가 이걸 쓴다: 일기는 여행 멤버 전부가 보는 한 장인데, 거기에 남의
 *  "나만 보기" 사진을 끼워 넣으면 앨범에서는 안 보이는 사진이 일기에서는
 *  보이게 된다. 올린 사람 자신이 만들어도 마찬가지다 — 일기는 남는다. */
export async function sharedPhotos(tripId: string): Promise<Photo[]> {
  const all = await store.listPhotos(tripId);
  return all.filter((p) => p.visibility !== "private");
}
