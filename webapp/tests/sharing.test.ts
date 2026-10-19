import { describe, expect, it } from "vitest";
import { EMPTY, applyLayer, isEmpty } from "@/lib/personal";
import { dmPartner, dmRoom, tripRoom } from "@/lib/chat";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/auth";

/* 여럿이 쓰면서 생긴 규칙들 — 개인 레이어 얹기, 대화 방 이름, 비밀번호.

   DB 가 끼는 길(누가 들어갈 수 있나)은 일회용 DB 에 앱을 띄워 HTTP 로 확인했다.
   여기서는 그 바탕이 되는 순수 계산만 잰다. */

describe("applyLayer — 공동 일정 위에 내 차이를 얹는다", () => {
  const shared = ["a", "b", "c", "d"];

  it("손댄 게 없으면 공동 그대로", () => {
    expect(applyLayer(shared, EMPTY)).toEqual(shared);
  });

  it("뺀 곳만 빠지고 순서는 지킨다", () => {
    expect(applyLayer(shared, { ...EMPTY, dropped: ["b"] })).toEqual(["a", "c", "d"]);
  });

  it("더한 곳은 뒤에 붙는다", () => {
    expect(applyLayer(shared, { ...EMPTY, added: ["e"] })).toEqual([...shared, "e"]);
  });

  it("빼면서 더하면 둘 다 반영된다", () => {
    expect(applyLayer(shared, { ...EMPTY, dropped: ["a"], added: ["z"] }))
      .toEqual(["b", "c", "d", "z"]);
  });

  it("이미 공동에 있는 곳을 더해도 두 번 나오지 않는다", () => {
    expect(applyLayer(shared, { ...EMPTY, added: ["b"] })).toEqual(shared);
  });

  it("없는 곳을 빼도 아무 일 없다 — 공동 일정이 바뀌어도 터지지 않게", () => {
    expect(applyLayer(shared, { ...EMPTY, dropped: ["없음"] })).toEqual(shared);
  });

  it("공동 일정을 바꾸지 않는다 (원본을 건드리지 않는다)", () => {
    const before = [...shared];
    applyLayer(shared, { ...EMPTY, dropped: ["a"], added: ["z"] });
    expect(shared).toEqual(before);
  });

  it("공동 일정이 바뀌면 내 수정이 그 위에 그대로 얹힌다", () => {
    /* 사본을 뜨지 않는 이유가 이것이다 — 주인이 'e' 를 더해도 내 '빼기'는 남는다 */
    const layer = { ...EMPTY, dropped: ["b"] };
    expect(applyLayer(["a", "b", "c"], layer)).toEqual(["a", "c"]);
    expect(applyLayer(["a", "b", "c", "e"], layer)).toEqual(["a", "c", "e"]);
  });
});

describe("isEmpty", () => {
  it("아무것도 없으면 빈 레이어 — 계산도 화면도 건너뛴다", () => {
    expect(isEmpty(EMPTY)).toBe(true);
  });

  it("하나라도 있으면 빈 게 아니다", () => {
    expect(isEmpty({ ...EMPTY, dropped: ["a"] })).toBe(false);
    expect(isEmpty({ ...EMPTY, added: ["a"] })).toBe(false);
    expect(isEmpty({ ...EMPTY, start: "10:30" })).toBe(false);
  });
});

describe("대화 방 이름", () => {
  it("여행 방은 trip:<여행>", () => {
    expect(tripRoom("trip-abc")).toBe("trip:trip-abc");
  });

  it("쌍마다 방이 하나다 — 누가 먼저 걸었는지와 무관하게", () => {
    expect(dmRoom("u-bbb", "u-aaa")).toBe(dmRoom("u-aaa", "u-bbb"));
  });

  it("id 를 정렬해 붙인다", () => {
    expect(dmRoom("u-bbb", "u-aaa")).toBe("dm:u-aaa:u-bbb");
  });

  it("dmPartner 는 상대를 꺼낸다", () => {
    const room = dmRoom("u-aaa", "u-bbb");
    expect(dmPartner(room, "u-aaa")).toBe("u-bbb");
    expect(dmPartner(room, "u-bbb")).toBe("u-aaa");
  });

  it("내가 끼지 않은 쌍이면 null — 남의 대화에 못 들어간다", () => {
    expect(dmPartner(dmRoom("u-aaa", "u-bbb"), "u-ccc")).toBeNull();
  });

  it("여행 방에서는 상대가 없다", () => {
    expect(dmPartner(tripRoom("trip-abc"), "u-aaa")).toBeNull();
  });
});

describe("비밀번호", () => {
  it("해시는 scrypt$salt$key 꼴이고 평문이 안 들어 있다", async () => {
    const plain = "gyeongju-bulguksa-2026";
    const stored = await hashPassword(plain);
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored.split("$")).toHaveLength(3);
    expect(stored.includes(plain)).toBe(false);
  });

  it("같은 비밀번호도 매번 다른 해시 — 소금이 다르다", async () => {
    const a = await hashPassword("same-password-here");
    const b = await hashPassword("same-password-here");
    expect(a).not.toBe(b);
  });

  it("맞으면 통과, 틀리면 거절", async () => {
    const stored = await hashPassword("gyeongju-bulguksa-2026");
    expect(await verifyPassword("gyeongju-bulguksa-2026", stored)).toBe(true);
    expect(await verifyPassword("gyeongju-bulguksa-2025", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("해시 꼴이 아니면 무조건 거절 — 카카오로 온 사람은 빈 해시다", async () => {
    expect(await verifyPassword("무엇이든", "")).toBe(false);
    expect(await verifyPassword("무엇이든", "plaintext")).toBe(false);
    expect(await verifyPassword("무엇이든", "scrypt$x$AAAA")).toBe(false);
  });

  it("약한 비밀번호는 까닭을 돌려준다", () => {
    expect(checkPasswordStrength("1234")).toContain("10자");
    expect(checkPasswordStrength("12345678901")).toContain("숫자만");
    expect(checkPasswordStrength("aaaaaaaaaaa")).toContain("같은 글자");
    expect(checkPasswordStrength("mypassword123")).toContain("흔한");
  });

  it("쓸 만한 비밀번호는 null (막지 않는다)", () => {
    expect(checkPasswordStrength("gyeongju-bulguksa-2026")).toBeNull();
    expect(checkPasswordStrength("우리가족경주여행갑니다")).toBeNull();
  });

  it("한글도 길이로만 센다 — 8자는 거절된다", () => {
    /* 한글 8자는 영문 8자보다 훨씬 많은 경우를 담지만, 규칙은 글자 수만 본다.
       쓰는 사람에게는 "열 자" 가 길어 보일 수 있다 — 바꿀 거리로 적어 둔다 */
    expect(checkPasswordStrength("우리가족경주여행")).toContain("10자");
  });
});
