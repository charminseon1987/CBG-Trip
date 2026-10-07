/* ============================================================
   사진을 어디에 둘 것인가

   그동안 사진은 data URI 그대로 DB 에 들어갔다. 혼자 쓰는 로컬에서는
   편했지만 배포하면 바로 깨진다 — 폰 사진을 1600px JPEG 로 줄여도 한 장에
   300~600KB 이고, base64 는 4/3 배라 400~800KB 가 된다. 스무 장만 불러도
   응답이 8~16MB 로 Vercel 함수 한도(4.5MB)를 넘겨 사진 탭이 통째로 안 열린다.

   그래서 저장할 곳을 하나 떼어 둔다.
     BLOB_READ_WRITE_TOKEN 이 있으면  → Vercel Blob 에 올리고 주소만 DB 에 적는다
     없으면                          → 지금처럼 data URI 를 그대로 둔다 (로컬 개발)

   DB 에는 어느 쪽이든 '주소 문자열' 하나만 남으므로 화면은 달라지지 않는다.
   ============================================================ */
import { del, put } from "@vercel/blob";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";

/** 사진을 바깥 저장소에 두는가 */
export const blobEnabled = () => Boolean(TOKEN);

const DATA_URI = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s;

/** data URI 를 바이트와 형식으로 가른다. data URI 가 아니면 null */
function decode(url: string): { bytes: Buffer; type: string } | null {
  const m = DATA_URI.exec(url);
  if (!m) return null;
  return { bytes: Buffer.from(m[2], "base64"), type: m[1] };
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/heic": "heic", "image/avif": "avif",
};

/** 사진 한 장을 저장하고 DB 에 적을 주소를 돌려준다.

    받은 값이 이미 http(s) 주소면 그대로 쓴다 — 바깥 사진을 링크로 붙인 경우다.
    data URI 인데 저장소가 없으면 그대로 돌려준다 (로컬에서 쓰던 방식). */
export async function storePhoto(tripId: string, url: string): Promise<string> {
  if (/^https?:\/\//i.test(url)) return url;

  const d = decode(url);
  if (!d) return url;                       // data URI 도 http 도 아니면 손대지 않는다
  if (!TOKEN) return url;                   // 로컬 — 지금까지 하던 대로

  const ext = EXT[d.type] ?? "bin";
  const { url: stored } = await put(`trips/${tripId}/${Date.now()}.${ext}`, d.bytes, {
    access: "public",
    contentType: d.type,
    /* 같은 밀리초에 두 장이 올라와도 덮어쓰지 않게 뒤에 임의 문자열을 붙인다 */
    addRandomSuffix: true,
    token: TOKEN,
  });
  return stored;
}

/** 사진을 지울 때 저장소의 파일도 같이 지운다.

    실패해도 넘어간다 — DB 에서 사라졌는데 파일이 남는 쪽이,
    사진이 안 지워졌다고 사용자에게 알리는 쪽보다 낫다. 남은 파일은
    언제든 정리할 수 있다. */
export async function dropPhoto(url: string): Promise<void> {
  if (!TOKEN) return;
  if (!/^https?:\/\//i.test(url)) return;   // data URI 는 DB 에만 있었다
  try {
    await del(url, { token: TOKEN });
  } catch (e) {
    console.warn("[blob] 파일을 지우지 못했습니다:", e instanceof Error ? e.message : e);
  }
}
