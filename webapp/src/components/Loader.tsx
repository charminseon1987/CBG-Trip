/** 불러오는 중 — 종이비행기가 점선 항로를 따라 도착 핀으로 날아간다.
   지도를 켰다 접었다 하는 대신, 여행앱답게 "가는 길"을 보여 준다. */
export default function Loader({
  note = "불러오는 중…",
  className = "",
}: {
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 py-8 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="loader" aria-hidden="true">
        <svg viewBox="0 0 120 46" className="h-full w-full" fill="none">
          <path d="M6 38 Q60 -16 114 38" className="loader-route" />
        </svg>
        <i className="ri-plane-fill loader-plane" />
        <i className="ri-map-pin-2-fill loader-pin" />
      </div>
      <span className="text-sm text-muted">{note}</span>
    </div>
  );
}
