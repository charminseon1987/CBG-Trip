/* ============================================================
   관리 화면의 숫자 — 전체 세기와 에이전트 토큰 장부.

   두 가지가 여기 모인다.
     1) logAgentRun — 모델을 한 번 부를 때마다 장부에 한 줄
     2) adminStats  — /admin 화면과 /api/admin/stats 가 나눠 쓰는 집계

   숫자는 전부 DB 에서 센다. 메모리 저장소(db 없음)면 셀 것이 없으므로
   hasDb 로 먼저 거른다 — adminStats 는 빈 값을 돌려주고 화면이
   "기록 없음" 을 그린다.
   ============================================================ */
import { sql } from "drizzle-orm";
import { getDb, hasDb, schema } from "@/db/client";

export interface AgentRunRec {
  agent: string;                          // plan·designer·album·ledger·pass·chief·classify
  tripId?: string | null;
  userId?: string | null;
  tier: string;
  model: string;
  provider: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  ms: number;
  toolCalls: number;
  fabricated?: boolean;
}

/** 모델 호출 한 번을 장부에 적는다.
 *
 *  이 기록이 실패해도 에이전트의 답까지 죽이면 안 된다 — 장부는 부가물이니
 *  절대 던지지 않고 경고만 남긴다. */
export async function logAgentRun(rec: AgentRunRec): Promise<void> {
  const c = getDb();
  if (!c) return;
  try {
    await c.ready;
    await c.db.insert(schema.agentRuns).values({
      agent: rec.agent,
      tripId: rec.tripId ?? null,
      userId: rec.userId ?? null,
      tier: rec.tier,
      model: rec.model,
      provider: rec.provider,
      inputTokens: rec.inputTokens ?? 0,
      outputTokens: rec.outputTokens ?? 0,
      ms: rec.ms,
      toolCalls: rec.toolCalls,
      fabricated: rec.fabricated ?? false,
    });
  } catch (e) {
    console.warn("[stats] 실행 기록 실패:", e instanceof Error ? e.message : e);
  }
}

/* ---------- 집계 ---------- */

export interface DayCount { date: string; n: number }
export interface TokenDay { date: string; input: number; output: number; runs: number }

export interface AdminStats {
  counts: {
    users: number; admins: number; trips: number; photos: number;
    expenses: number; expenseSum: number; messages: number;
    activeSessions: number; pendingInvites: number; pendingRequests: number;
    diaries: number; agentRuns: number;
  };
  /** 최근 30일, 하루도 빠짐없이 (없는 날은 0) */
  signups: DayCount[];
  tokens: {
    input: number; output: number; runs: number; avgMs: number; fabricated: number;
    byDay: TokenDay[];                                     // 최근 30일
    byAgent: { agent: string; runs: number; input: number; output: number }[];
    byModel: { model: string; provider: string; runs: number; input: number; output: number }[];
    recent: {
      id: number; createdAt: string; agent: string; model: string;
      input: number; output: number; ms: number; toolCalls: number; fabricated: boolean;
    }[];
  };
}

const DAY_MS = 864e5;
const days = (n: number) => {
  /* 어제까지 거슬러 올라가는 날짜 뼈대 — 기록이 없는 날도 차트에 0 으로 그려야
     "안 쓴 날" 과 "잘린 날" 이 구분된다 */
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(today.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
};

const EMPTY: AdminStats = {
  counts: {
    users: 0, admins: 0, trips: 0, photos: 0, expenses: 0, expenseSum: 0,
    messages: 0, activeSessions: 0, pendingInvites: 0, pendingRequests: 0,
    diaries: 0, agentRuns: 0,
  },
  signups: days(30).map((date) => ({ date, n: 0 })),
  tokens: {
    input: 0, output: 0, runs: 0, avgMs: 0, fabricated: 0,
    byDay: days(30).map((date) => ({ date, input: 0, output: 0, runs: 0 })),
    byAgent: [], byModel: [], recent: [],
  },
};

export async function adminStats(tokenDays = 30): Promise<AdminStats> {
  const c = getDb();
  if (!hasDb() || !c) return EMPTY;
  await c.ready;
  const db = c.db;
  const span = Math.min(90, Math.max(1, Math.floor(tokenDays)));

  const one = async (q: ReturnType<typeof sql>) =>
    ((await db.get<{ n: number }>(q))?.n ?? 0);

  /* created_at 꼴이 두 가지다 — CURRENT_TIMESTAMP("YYYY-MM-DD HH:MM:SS") 와
     JS 의 toISOString("YYYY-MM-DDT…"). 둘 다 앞 10자가 날짜라 substr 이 통한다 */
  const [
    users, admins, trips, photos, expenses, expenseSum, messages,
    activeSessions, pendingInvites, pendingRequests, diaries, agentRuns,
    signupRows, tokDayRows, tokAgentRows, tokModelRows, tokTotal, recent,
  ] = await Promise.all([
    one(sql`SELECT COUNT(*) n FROM users`),
    one(sql`SELECT COUNT(*) n FROM users WHERE role = 'admin'`),
    one(sql`SELECT COUNT(*) n FROM trips`),
    one(sql`SELECT COUNT(*) n FROM photos`),
    one(sql`SELECT COUNT(*) n FROM expenses`),
    one(sql`SELECT COALESCE(SUM(amount),0) n FROM expenses`),
    one(sql`SELECT COUNT(*) n FROM chat_messages`),
    one(sql`SELECT COUNT(*) n FROM sessions WHERE expires_at > ${Date.now()}`),
    one(sql`SELECT COUNT(*) n FROM trip_invites WHERE used_at IS NULL AND expires_at > ${Date.now()}`),
    one(sql`SELECT COUNT(*) n FROM trip_join_requests WHERE status = 'pending'`),
    one(sql`SELECT COUNT(*) n FROM diaries`),
    one(sql`SELECT COUNT(*) n FROM agent_runs`),
    db.all<{ d: string; n: number }>(sql`
      SELECT substr(created_at,1,10) d, COUNT(*) n
      FROM users WHERE created_at >= ${new Date(Date.now() - 29 * DAY_MS).toISOString()}
      GROUP BY d`),
    db.all<{ d: string; i: number; o: number; n: number }>(sql`
      SELECT substr(created_at,1,10) d,
             SUM(input_tokens) i, SUM(output_tokens) o, COUNT(*) n
      FROM agent_runs WHERE created_at >= ${new Date(Date.now() - (span - 1) * DAY_MS).toISOString()}
      GROUP BY d`),
    db.all<{ agent: string; n: number; i: number; o: number }>(sql`
      SELECT agent, COUNT(*) n, SUM(input_tokens) i, SUM(output_tokens) o
      FROM agent_runs GROUP BY agent ORDER BY (i + o) DESC`),
    db.all<{ model: string; provider: string; n: number; i: number; o: number }>(sql`
      SELECT model, provider, COUNT(*) n, SUM(input_tokens) i, SUM(output_tokens) o
      FROM agent_runs GROUP BY model, provider ORDER BY (i + o) DESC`),
    db.get<{ i: number; o: number; n: number; ms: number; fab: number }>(sql`
      SELECT COALESCE(SUM(input_tokens),0) i, COALESCE(SUM(output_tokens),0) o,
             COUNT(*) n, COALESCE(AVG(ms),0) ms,
             COALESCE(SUM(fabricated),0) fab
      FROM agent_runs`),
    db.all<{
      id: number; created_at: string; agent: string; model: string;
      i: number; o: number; ms: number; tc: number; fab: number;
    }>(sql`
      SELECT id, created_at, agent, model, input_tokens i, output_tokens o,
             ms, tool_calls tc, fabricated fab
      FROM agent_runs ORDER BY id DESC LIMIT 20`),
  ]);

  const signupMap = new Map(signupRows.map((r) => [r.d, r.n]));
  const tokMap = new Map(tokDayRows.map((r) => [r.d, r]));

  return {
    counts: {
      users, admins, trips, photos, expenses, expenseSum, messages,
      activeSessions, pendingInvites, pendingRequests, diaries, agentRuns,
    },
    signups: days(30).map((date) => ({ date, n: signupMap.get(date) ?? 0 })),
    tokens: {
      input: tokTotal?.i ?? 0,
      output: tokTotal?.o ?? 0,
      runs: tokTotal?.n ?? 0,
      avgMs: Math.round(tokTotal?.ms ?? 0),
      fabricated: tokTotal?.fab ?? 0,
      byDay: days(span).map((date) => ({
        date,
        input: tokMap.get(date)?.i ?? 0,
        output: tokMap.get(date)?.o ?? 0,
        runs: tokMap.get(date)?.n ?? 0,
      })),
      byAgent: tokAgentRows.map((r) => ({ agent: r.agent, runs: r.n, input: r.i, output: r.o })),
      byModel: tokModelRows.map((r) => ({ model: r.model, provider: r.provider, runs: r.n, input: r.i, output: r.o })),
      recent: (recent ?? []).map((r) => ({
        id: r.id, createdAt: r.created_at, agent: r.agent, model: r.model,
        input: r.i, output: r.o, ms: r.ms, toolCalls: r.tc, fabricated: Boolean(r.fab),
      })),
    },
  };
}
