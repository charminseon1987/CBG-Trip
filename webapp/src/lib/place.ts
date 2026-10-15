/* 사진·지출에 "그 시각 장소"를 붙이는 공용 조회.
   일정 데이터가 없는 여행이면 null 이다. */
import { whereAt } from "./itinerary";
import { getRegion } from "./regions";
import { store } from "./store";

/** 며칠짜리 여행이면 그 날의 일정을 봐야 한다 — 날짜를 안 주면 첫날 */
export async function placeAt(
  tripId: string, date: string | null, time: string,
): Promise<string | null> {
  const trip = await store.getTrip(tripId);
  const pack = getRegion(trip?.region);
  const it = await store.getItinerary(tripId, date ?? undefined);
  if (!pack || !it) return null;
  return whereAt(pack, it.items, it.start, it.busy, time);
}
