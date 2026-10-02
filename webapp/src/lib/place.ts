/* 사진·지출에 "그 시각 장소"를 붙이는 공용 조회.
   일정 데이터가 없는 여행이면 null 이다. */
import { whereAt } from "./itinerary";
import { getRegion } from "./regions";
import { store } from "./store";

export async function placeAt(tripId: string, time: string): Promise<string | null> {
  const trip = await store.getTrip(tripId);
  const pack = getRegion(trip?.region);
  const it = await store.getItinerary(tripId);
  if (!pack || !it) return null;
  return whereAt(pack, it.items, it.start, it.busy, time);
}
