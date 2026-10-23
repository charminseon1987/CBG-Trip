import Link from "next/link";
import { redirect } from "next/navigation";
import AdminRefresh from "@/components/AdminRefresh";
import AdminUsers from "@/components/AdminUsers";
import CatFace from "@/components/CatFace";
import { AgentShare, Bars, Empty, StackedBars, agentColor, agentLabel, fmt, fmtMan } from "@/components/AdminCharts";
import { currentUser, listUsers } from "@/lib/auth";
import { adminStats } from "@/lib/stats";
import { storeKind } from "@/lib/store";
import { hasModel, isLocal, modelName, providerId } from "@/agents/provider";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const me = await currentUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") {
    return (
      <main className="mx-auto max-w-md px-6 py-20 pb-24">
        <h1 className="text-xl font-bold">권한이 없습니다</h1>
        <p className="mt-2 text-ink-2">관리자만 볼 수 있는 화면입니다.</p>
        <Link href="/" className="btn mt-4 inline-flex">여행 목록으로</Link>
      </main>
    );
  }

  const { days: daysParam } = await searchParams;
  const span = daysParam === "7" ? 7 : 30;
  const [users, stats] = await Promise.all([listUsers(), adminStats(span)]);
  const { counts, tokens, signups } = stats;
  const tokenTotal = tokens.input + tokens.output;

  return (
    <main className="page-in mx-auto w-full max-w-6xl px-5 py-10 pb-24">
      {/* ── 머리 ── */}
      <div className="flex flex-wrap items-center gap-3">
        <CatFace who="chief" size={44} ring="border-brand" />
        <div>
          <p className="font-mono text-[12.5px] font-bold uppercase tracking-[0.18em] text-brand">
            Admin
          </p>
          <h1 className="text-2xl font-bold">관리자 대시보드</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <EnvChip>{storeKind()}</EnvChip>
          <EnvChip tone={hasModel() ? "ok" : "warn"}>
            {hasModel()
              ? `${providerId()} · ${modelName("quick")}${isLocal() ? " · 내 컴퓨터" : ""}`
              : "모델 미연결"}
          </EnvChip>
          <AdminRefresh />
          <Link href="/" className="btn !h-9 !w-9 !p-0" title="여행 목록으로" aria-label="여행 목록으로">
            <i className="ri-map-2-line" />
          </Link>
        </div>
      </div>

      {/* ── 조치가 필요한 상태 ── */}
      {!hasModel() && (
        <Banner tone="warn" icon="ri-cpu-line">
          <b>모델이 연결되어 있지 않습니다.</b> 냥이 채팅은 규칙으로만 답하고 토큰은
          기록되지 않습니다. <code className="rounded bg-black/5 px-1">ANTHROPIC_API_KEY</code> 또는
          바깥 서버 주소를 설정하면 모델이 연결됩니다.
        </Banner>
      )}
      {counts.pendingRequests > 0 && (
        <Banner tone="info" icon="ri-user-add-line">
          <b>승인을 기다리는 참여 신청이 {fmt(counts.pendingRequests)}건 있습니다.</b>{" "}
          각 여행의 &lsquo;함께&rsquo; 탭에서 처리합니다.
        </Banner>
      )}

      {/* ── 핵심 수치 ── */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon="ri-group-line" color="var(--z-global)" k="사용자"
             v={`${fmt(counts.users)}명`} s={`관리자 ${fmt(counts.admins)}명`} />
        <Kpi icon="ri-map-pin-2-line" color="var(--z-zoo)" k="여행"
             v={`${fmt(counts.trips)}개`} s={`사진 ${fmt(counts.photos)}장 · 일기 ${fmt(counts.diaries)}장`} />
        <Kpi icon="ri-coin-line" color="var(--z-amer)" k="누적 지출"
             v={`₩${fmt(counts.expenseSum)}`} s={`${fmt(counts.expenses)}건 기록`} />
        <Kpi icon="ri-cpu-line" color="var(--brand)" k="누적 토큰"
             v={fmtMan(tokenTotal)} s={`호출 ${fmt(tokens.runs)}회`} />
      </section>

      {/* ── 모델 사용량 ── */}
      <section className="mt-8 rounded-2xl border border-rule bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-rule px-5 py-4">
          <SectionIcon icon="ri-cpu-line" color="var(--brand)" />
          <div className="mr-auto">
            <h2 className="font-bold">모델 사용량</h2>
            <p className="text-xs text-muted">모델을 호출할 때마다 입력·출력 토큰을 기록합니다.</p>
          </div>
          <PeriodLinks span={span} />
        </div>

        {/* 요약 수치 — 카드를 겹겹이 쌓지 않고 한 줄로 */}
        <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule sm:grid-cols-6">
          <Stat k="총 토큰" v={fmt(tokenTotal)} strong />
          <Stat k="입력" v={fmtMan(tokens.input)} color="var(--z-global)" />
          <Stat k="출력" v={fmtMan(tokens.output)} color="var(--brand)" />
          <Stat k="호출 수" v={`${fmt(tokens.runs)}회`} />
          <Stat k="평균 응답" v={`${(tokens.avgMs / 1000).toFixed(1)}초`} />
          <Stat k="오류 응답" v={`${fmt(tokens.fabricated)}건`}
                color={tokens.fabricated ? "var(--rose)" : undefined} />
        </dl>

        <div className="px-5 pb-5 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-2">일별 사용량 · 최근 {span}일</h3>
            <div className="flex gap-3 text-xs font-bold text-ink-2">
              <Legend color="var(--z-global)" label="입력" />
              <Legend color="var(--brand)" label="출력" />
            </div>
          </div>
          {tokens.byDay.some((d) => d.runs > 0) ? (
            <div className="mt-2">
              <StackedBars
                rows={tokens.byDay}
                a={(r) => r.input} b={(r) => r.output}
                labelA="입력" labelB="출력"
                colorA="var(--z-global)" colorB="var(--brand)"
              />
            </div>
          ) : (
            <div className="mt-2"><Empty text={`최근 ${span}일 동안 모델 호출 기록이 없습니다`} /></div>
          )}
        </div>

        <div className="grid border-t border-rule lg:grid-cols-2">
          <div className="px-5 py-4 lg:border-r lg:border-rule">
            <h3 className="text-sm font-bold text-ink-2">에이전트별 사용량</h3>
            <div className="mt-3"><AgentShare rows={tokens.byAgent} /></div>
          </div>
          <div className="border-t border-rule px-5 py-4 lg:border-t-0">
            <h3 className="text-sm font-bold text-ink-2">모델별 사용량</h3>
            {tokens.byModel.length ? (
              <table className="mt-1 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5 font-normal">모델</th>
                    <th className="py-1.5 font-normal">호출</th>
                    <th className="py-1.5 text-right font-normal">입력</th>
                    <th className="py-1.5 text-right font-normal">출력</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.byModel.map((m) => (
                    <tr key={`${m.provider}:${m.model}`} className="border-t border-rule">
                      <td className="py-2">
                        <span className="font-bold">{m.model || "(이름 없음)"}</span>
                        <span className="ml-1 text-xs text-muted">{m.provider}</span>
                      </td>
                      <td className="py-2 text-ink-2">{fmt(m.runs)}회</td>
                      <td className="py-2 text-right font-mono text-z-global">{fmtMan(m.input)}</td>
                      <td className="py-2 text-right font-mono text-brand">{fmtMan(m.output)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-3"><Empty text="기록이 없습니다" /></div>
            )}
          </div>
        </div>
      </section>

      {/* ── 최근 호출 ── */}
      <section className="mt-4 rounded-2xl border border-rule bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
          <SectionIcon icon="ri-history-line" color="var(--z-global)" />
          <div>
            <h2 className="font-bold">최근 호출</h2>
            <p className="text-xs text-muted">가장 최근 20건만 보여 줍니다.</p>
          </div>
        </div>
        {tokens.recent.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-normal">시각</th>
                  <th className="px-3 py-2.5 font-normal">에이전트</th>
                  <th className="px-3 py-2.5 font-normal">모델</th>
                  <th className="px-3 py-2.5 text-right font-normal">입력</th>
                  <th className="px-3 py-2.5 text-right font-normal">출력</th>
                  <th className="px-3 py-2.5 text-right font-normal">소요</th>
                  <th className="px-5 py-2.5 text-right font-normal">도구</th>
                </tr>
              </thead>
              <tbody>
                {tokens.recent.map((r) => (
                  <tr key={r.id} className="border-t border-rule first:border-t-0">
                    <td className="px-5 py-2.5 font-mono text-xs text-ink-2">{fmtTime(r.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <span className="chip" style={{ color: agentColor(r.agent) }}>
                        {agentLabel(r.agent)}
                      </span>
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2.5 text-xs text-ink-2">{r.model}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(r.input)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(r.output)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-ink-2">
                      {(r.ms / 1000).toFixed(1)}s
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs text-ink-2">
                      {r.fabricated
                        ? <span className="font-bold text-rose">오류</span>
                        : r.toolCalls}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="m-5"><Empty text="아직 호출 기록이 없습니다 — 냥이 채팅을 사용하면 여기에 쌓입니다" /></div>
        )}
      </section>

      {/* ── 서비스 현황 ── */}
      <section className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-rule bg-card shadow-sm lg:col-span-3">
          <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
            <SectionIcon icon="ri-line-chart-line" color="var(--z-global)" />
            <div>
              <h2 className="font-bold">가입 추이</h2>
              <p className="text-xs text-muted">최근 30일 · 하루 단위</p>
            </div>
          </div>
          <div className="px-5 pb-5 pt-4">
            <Bars rows={signups} color="var(--z-global)" />
          </div>
        </div>
        <div className="rounded-2xl border border-rule bg-card shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
            <SectionIcon icon="ri-dashboard-3-line" color="var(--z-magic)" />
            <div>
              <h2 className="font-bold">서비스 현황</h2>
              <p className="text-xs text-muted">지금 쌓여 있는 것들</p>
            </div>
          </div>
          <ul className="divide-y divide-rule">
            <Row icon="ri-key-2-line" k="활성 세션" v={`${fmt(counts.activeSessions)}개`} />
            <Row icon="ri-link" k="사용 가능한 초대" v={`${fmt(counts.pendingInvites)}장`} />
            <Row icon="ri-user-add-line" k="승인 대기 신청" v={`${fmt(counts.pendingRequests)}건`}
                 warn={counts.pendingRequests > 0} />
            <Row icon="ri-chat-3-line" k="채팅 메시지" v={`${fmt(counts.messages)}개`} />
            <Row icon="ri-image-line" k="사진" v={`${fmt(counts.photos)}장`} />
            <Row icon="ri-book-open-line" k="여행일기" v={`${fmt(counts.diaries)}장`} />
          </ul>
        </div>
      </section>

      {/* ── 사용자 관리 ── */}
      <AdminUsers initial={users} meId={me.id} />

      {/* ── 주의사항 ── */}
      <section className="mt-6 rounded-2xl border border-rule bg-card p-5 text-sm text-ink-2 shadow-sm">
        <h2 className="flex items-center gap-1.5 font-bold text-ink">
          <i className="ri-error-warning-line text-z-amer" /> 주의사항
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>비밀번호는 scrypt 해시로만 저장됩니다. 원문은 서버에도 남지 않아 <b>복구가 불가능</b>하며, 잊어버리면 여기서 재설정해야 합니다.</li>
          <li>비밀번호를 재설정하면 해당 사용자의 <b>모든 기기가 로그아웃</b>됩니다.</li>
          <li>사용자를 삭제하면 여행·일정·사진·지출이 <b>함께 삭제되고 되돌릴 수 없습니다</b>.</li>
          <li>관리자가 한 명뿐일 때는 그 계정의 권한 변경·삭제가 불가능합니다.</li>
          <li>토큰 장부는 모델이 응답한 실제 사용량을 기록합니다. 모델 없이 규칙으로 답한 호출은 0으로 집계됩니다.</li>
        </ul>
      </section>
    </main>
  );
}

/* ---------- 조각 ---------- */

const SectionIcon = ({ icon, color }: { icon: string; color: string }) => (
  <span
    className="grid h-9 w-9 shrink-0 place-content-center rounded-xl text-base"
    style={{ background: `color-mix(in srgb, ${color} 12%, white)`, color }}
  >
    <i className={icon} />
  </span>
);

const Kpi = ({ icon, color, k, v, s }: {
  icon: string; color: string; k: string; v: string; s: string;
}) => (
  <div className="rounded-2xl border border-rule bg-card p-4 shadow-sm">
    <div className="flex items-center gap-2">
      <SectionIcon icon={icon} color={color} />
      <span className="text-xs font-bold text-muted">{k}</span>
    </div>
    <p className="mt-2 font-mono text-[1.55rem] font-extrabold leading-none tracking-tight">{v}</p>
    <p className="mt-1.5 text-xs text-muted">{s}</p>
  </div>
);

const Stat = ({ k, v, color, strong }: { k: string; v: string; color?: string; strong?: boolean }) => (
  <div className="px-3.5 py-3 text-center">
    <p className="text-[11px] font-bold text-muted">{k}</p>
    <p className={`mt-0.5 font-mono font-extrabold ${strong ? "text-lg" : "text-base"}`}
       style={color ? { color } : undefined}>
      {v}
    </p>
  </div>
);

const Row = ({ icon, k, v, warn }: { icon: string; k: string; v: string; warn?: boolean }) => (
  <li className="flex items-center gap-3 px-5 py-3">
    <i className={`${icon} ${warn ? "text-rose" : "text-muted"}`} />
    <span className="text-sm text-ink-2">{k}</span>
    <span className={`ml-auto font-mono text-sm font-extrabold ${warn ? "text-rose" : ""}`}>{v}</span>
  </li>
);

const EnvChip = ({ children, tone }: { children: React.ReactNode; tone?: "ok" | "warn" }) => (
  <span
    className="chip"
    style={{
      color: tone === "ok" ? "var(--z-zoo)" : tone === "warn" ? "var(--rose)" : "var(--muted)",
      background: "#fff",
    }}
  >
    {children}
  </span>
);

const Banner = ({ tone, icon, children }: {
  tone: "warn" | "info"; icon: string; children: React.ReactNode;
}) => (
  <div
    className="mt-4 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm"
    style={{
      borderColor: tone === "warn" ? "var(--rose)" : "var(--z-global)",
      background: tone === "warn" ? "rgba(232,69,107,.06)" : "rgba(47,155,232,.06)",
      color: "var(--ink)",
    }}
  >
    <i className={`${icon} mt-0.5`} style={{ color: tone === "warn" ? "var(--rose)" : "var(--z-global)" }} />
    <p>{children}</p>
  </div>
);

const PeriodLinks = ({ span }: { span: number }) => (
  <div className="flex overflow-hidden rounded-full border border-rule text-xs font-bold">
    {[7, 30].map((d) => (
      <Link
        key={d}
        href={d === 30 ? "/admin" : `/admin?days=${d}`}
        className={`px-3 py-1.5 ${d === span ? "bg-brand text-white" : "bg-card text-ink-2"}`}
      >
        {d}일
      </Link>
    ))}
  </div>
);

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
    {label}
  </span>
);

/* created_at 꼴이 두 가지다 — "YYYY-MM-DD HH:MM:SS"(UTC) 와 ISO("…T…Z").
   띄어쓰기 꼴은 그대로 Date 에 넣으면 로컬 시각으로 읽혀 UTC 와 엇갈리니
   UTC 로 바꿔 읽는다 */
const parseTs = (s: string) => new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
const fmtTime = (s: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(parseTs(s));
