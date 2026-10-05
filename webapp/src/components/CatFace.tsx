/* 우리집 러시안블루들. 에이전트마다 한 마리씩 얼굴을 쓴다. */
import Image from "next/image";

export const CAT: Record<string, { src: string; alt: string }> = {
  chief: { src: "/cats/cat-chief.jpg", alt: "총괄 냥이" },
  plan: { src: "/cats/cat-plan.jpg", alt: "일정 냥이" },
  designer: { src: "/cats/cat-designer.jpg", alt: "설계 냥이" },
  album: { src: "/cats/cat-album.jpg", alt: "앨범 냥이" },
  ledger: { src: "/cats/cat-ledger.jpg", alt: "가계부 냥이" },
  pass: { src: "/cats/cat-pass.jpg", alt: "패스권 냥이" },
  logo: { src: "/cats/cat-face.jpg", alt: "우리집 냥이" },
  sleep: { src: "/cats/cat-sleep.jpg", alt: "자는 아깽이" },
  stretch: { src: "/cats/cat-stretch.jpg", alt: "러그 위 냥이" },
};

export default function CatFace({
  who, size = 32, ring = "border-rule", className = "",
}: {
  who: keyof typeof CAT | string;
  size?: number;
  ring?: string;
  className?: string;
}) {
  const c = CAT[who] ?? CAT.chief;
  return (
    <Image
      src={c.src}
      alt={c.alt}
      width={size}
      height={size}
      className={`shrink-0 rounded-full border-2 object-cover ${ring} ${className}`}
      style={{ width: size, height: size }}
      unoptimized
    />
  );
}
