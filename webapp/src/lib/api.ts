/* 프론트에서 REST 를 부르는 얇은 층. 봉투({ok,data})를 여기서 벗긴다. */
export type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as Envelope<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

/** 총괄 스트림을 한 줄씩 읽는다 */
export async function* chiefStream(tripId: string, message: string) {
  const res = await fetch("/api/chief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tripId, message }),
  });
  if (!res.body) throw new Error("스트림을 열지 못했습니다.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as Record<string, unknown>;
    }
  }
}
