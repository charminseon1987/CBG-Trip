/* 위경도 → 지도 좌표. 지역팩이 들고 있는 투영 파라미터를 그대로 쓴다.
   (지역팩을 구울 때 쓴 식의 역이다 — scripts/build_region.py 참고) */
export interface Origin {
  x0: number; y0: number; scale: number;
  lat0: number; lng0: number; mlat: number; mlng: number;
}

export function project(o: Origin, lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng - o.lng0) * o.mlng - o.x0) * o.scale,
    y: (-(lat - o.lat0) * o.mlat - o.y0) * o.scale,
  };
}

/** 두 지점 사이 직선 거리(m) — 하버사인 대신 평면 근사로 충분하다 (수 km 범위) */
export function metersBetween(o: Origin, aLat: number, aLng: number, bLat: number, bLng: number) {
  const dx = (aLng - bLng) * o.mlng;
  const dy = (aLat - bLat) * o.mlat;
  return Math.hypot(dx, dy);
}

/** 지도 밖인지 — 공원에서 멀리 있으면 내 위치를 찍지 않는다 */
export const outside = (p: { x: number; y: number }, vw: number, vh: number, pad = 140) =>
  p.x < -pad || p.y < -pad || p.x > vw + pad || p.y > vh + pad;
