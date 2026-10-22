"use client";

/* 여행 알람 — 앱(Capacitor)에서는 로컬 알림을 예약하고,
   브라우저에서는 웹 Notification 으로 "켜졌다" 까지만 알린다.
   웹에는 예약 알림이 없어서다 — 페이지를 닫으면 울릴 길이 없다.

   네이티브 모듈은 브라우저 번들에 안 얹으려고 다 dynamic import 다. */
import type { Trip } from "./types";

const ENABLED_KEY = "trip-alarms";

export function alarmsEnabled(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(ENABLED_KEY) === "1";
}

/* 알림 id 는 정수여야 한다 — 여행 id 를 해시해 쓰고, 뒷자리로 종류를 나눈다 */
function notifId(tripId: string, kind: number): number {
  let h = 0;
  for (const ch of tripId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 100_000) * 10 + kind;
}

async function nativeOn(): Promise<boolean> {
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform();
}

/** 여행마다 두 발 — 전날 저녁 8시 "내일 간다", 당일 아침 8시 "오늘이다" */
async function scheduleNative(trips: Trip[]) {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  /* 예전 예약을 전부 걷고 다시 싼다 — 지나간 여행·지운 여행이 남지 않게 */
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications });
  }

  const now = Date.now();
  const list: {
    id: number; title: string; body: string;
    schedule: { at: Date };
  }[] = [];

  for (const t of trips) {
    if (!t.date) continue;
    const start = new Date(`${t.date}T00:00:00`);
    if (Number.isNaN(start.getTime())) continue;

    const eve = new Date(start.getTime() - 86400000);
    eve.setHours(20, 0, 0, 0);
    if (eve.getTime() > now) {
      list.push({
        id: notifId(t.id, 1), title: "내일 여행 가는 날",
        body: `${t.title}${t.place ? ` · ${t.place}` : ""}`,
        schedule: { at: eve },
      });
    }
    const morn = new Date(start);
    morn.setHours(8, 0, 0, 0);
    if (morn.getTime() > now) {
      list.push({
        id: notifId(t.id, 2), title: "오늘 여행 가는 날",
        body: `${t.title}${t.place ? ` · ${t.place}` : ""} — 좋은 여행 되세요!`,
        schedule: { at: morn },
      });
    }
  }
  if (list.length) await LocalNotifications.schedule({ notifications: list });
  return list.length;
}

/** 알림을 켠다. 성공하면 "", 사유가 있으면 그 사유를 돌려준다 */
export async function enableAlarms(trips: Trip[]): Promise<string> {
  if (await nativeOn()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") {
      return "알림이 차단되어 있습니다. 기기 설정에서 켜 주세요.";
    }
    await scheduleNative(trips);
  } else {
    if (!("Notification" in window)) return "이 브라우저는 알림을 지원하지 않습니다.";
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "알림이 차단되어 있습니다. 브라우저 설정에서 켜 주세요.";
    new Notification("여행 알림을 켰습니다", {
      body: "앱(iOS·안드로이드)에서는 출발 전날 저녁과 당일 아침에 알람이 울립니다.",
      icon: "/cats/cat-chief.jpg",
    });
  }
  localStorage.setItem(ENABLED_KEY, "1");
  return "";
}

/** 알림을 끈다 — 예약해 둔 것도 같이 걷는다 */
export async function disableAlarms() {
  localStorage.removeItem(ENABLED_KEY);
  if (await nativeOn()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }
  }
}
