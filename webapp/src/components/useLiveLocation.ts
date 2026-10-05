"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { metersBetween, outside, project, type Origin } from "@/lib/geo";
import type { MePos } from "./TripMap";

export type GpsState = "off" | "asking" | "on" | "denied" | "unavailable" | "outside";

export interface Live {
  state: GpsState;
  me: MePos | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;      // m
  message: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * 실시간 내 위치를 지도 좌표로 바꿔 돌려준다.
 *
 * 브라우저 위치 권한은 사용자가 버튼을 눌렀을 때만 묻는다 — 화면을 열자마자 묻지 않는다.
 * 위치는 HTTPS 또는 localhost 에서만 제공된다.
 */
export function useLiveLocation(origin: Origin | null, vw: number, vh: number, mPerPx: number): Live {
  const [state, setState] = useState<GpsState>("off");
  const [me, setMe] = useState<MePos | null>(null);
  const [raw, setRaw] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const watchRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setState("off");
    setMe(null);
    setRaw(null);
    setMessage(null);
  }, []);

  const start = useCallback(() => {
    if (!origin) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("unavailable");
      setMessage("이 브라우저는 위치를 지원하지 않습니다.");
      return;
    }
    if (!window.isSecureContext) {
      setState("unavailable");
      setMessage("위치는 https 또는 localhost 에서만 쓸 수 있습니다.");
      return;
    }
    setState("asking");
    setMessage("위치 권한을 확인하는 중…");

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading } = pos.coords;
        const p = project(origin, latitude, longitude);
        setRaw({ lat: latitude, lng: longitude, acc: accuracy });
        if (outside(p, vw, vh)) {
          setState("outside");
          setMe(null);
          setMessage("아직 공원 밖입니다. 도착하면 지도에 표시됩니다.");
          return;
        }
        setState("on");
        setMessage(null);
        setMe({
          x: p.x, y: p.y,
          accuracyPx: Math.min(60, accuracy / mPerPx),
          heading: heading != null && !Number.isNaN(heading) ? heading : null,
        });
      },
      (err) => {
        setMe(null);
        if (err.code === err.PERMISSION_DENIED) {
          setState("denied");
          setMessage("위치 권한이 거부됐습니다. 주소창의 자물쇠에서 허용으로 바꿔 주세요.");
        } else {
          setState("unavailable");
          setMessage(
            err.code === err.TIMEOUT ? "위치를 찾는 데 시간이 걸립니다. 하늘이 보이는 곳에서 다시 시도해 주세요."
              : "위치를 가져오지 못했습니다.",
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }, [origin, vw, vh, mPerPx]);

  useEffect(() => () => {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  return {
    state, me,
    lat: raw?.lat ?? null, lng: raw?.lng ?? null, accuracy: raw?.acc ?? null,
    message, start, stop,
  };
}

/** 내 위치에서 목적지까지 직선 거리(m). 실제 길 거리는 서버가 계산한 값을 쓰고, 이건 "다 왔는지" 판단용이다. */
export function straightTo(
  origin: Origin, lat: number, lng: number, tLat: number, tLng: number,
) {
  return metersBetween(origin, lat, lng, tLat, tLng);
}
