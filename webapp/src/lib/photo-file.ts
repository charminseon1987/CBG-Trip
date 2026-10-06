/* 브라우저에서 사진 파일을 올릴 준비를 한다 (클라이언트 전용).
   1) EXIF 의 찍은 날짜·시각을 읽는다 — 날짜별로 나누는 기준
   2) 긴 변 1600px JPEG 로 줄여 data URI 로 만든다 — 스토리지를 붙이기 전까지 */

export interface Prepared {
  url: string;
  date: string | null;     // EXIF 가 없으면 null
  takenAt: string | null;
}

/** JPEG 의 EXIF DateTimeOriginal("2026:10:09 14:03:22") 을 읽는다. 없으면 null */
export async function exifTaken(file: File): Promise<{ date: string; time: string } | null> {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null;               // JPEG 아님 (HEIC 등)
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {   // "Exif"
        return readTiff(v, off + 10);
      }
      if ((marker & 0xff00) !== 0xff00) return null;
      off += 2 + size;
    }
  } catch {
    /* 읽지 못하면 아래 대체값을 쓴다 */
  }
  return null;
}

function readTiff(v: DataView, start: number) {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(start + o, le);
  const u32 = (o: number) => v.getUint32(start + o, le);
  const ascii = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(start + o + i));
    return s;
  };
  const scan = (ifd: number, want: number): number | null => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === want) return e;
    }
    return null;
  };
  const ifd0 = u32(4);
  const exifPtr = scan(ifd0, 0x8769);
  const pick = (ifd: number, tag: number) => {
    const e = scan(ifd, tag);
    return e === null ? null : ascii(u32(e + 8), u32(e + 4));
  };
  const raw = (exifPtr !== null && pick(u32(exifPtr + 8), 0x9003)) || pick(ifd0, 0x0132);
  const m = raw && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}

/** 긴 변 max px 로 줄인 JPEG data URI. 회전 정보는 브라우저가 반영한다 */
export async function shrink(file: File, max = 1600, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/jpeg", quality);
}

export async function prepare(file: File): Promise<Prepared> {
  const [taken, url] = await Promise.all([exifTaken(file), shrink(file)]);
  return { url, date: taken?.date ?? null, takenAt: taken?.time ?? null };
}
