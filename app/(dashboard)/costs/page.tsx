import { services } from "@/lib/container";
import { computeMetrics } from "@/lib/metrics";
import { COSTS } from "@/config/costs";
import { env } from "@/lib/env";
import { Hero } from "@/app/ui";
import { CountUp } from "@/app/fx/count-up";

const R = 32, LEN = 2 * Math.PI * R;
function Ring({ value, label, sub }: { value: number | null; label: string; sub?: string }) {
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="ring-card glow tilt">
      <svg className="ring" viewBox="0 0 76 76" role="img" aria-label={`${label}: ${value == null ? "no data" : `${Math.round(v * 100)}%`}`}>
        <circle className="track" cx="38" cy="38" r={R} />
        <circle className="bar" cx="38" cy="38" r={R} style={{ ["--len" as string]: LEN, ["--off" as string]: LEN * (1 - v) }} />
        <text x="38" y="44" textAnchor="middle">{value == null ? "—" : `${Math.round(v * 100)}%`}</text>
      </svg>
      <div><div className="tile-label">{label}</div>{sub && <div className="small muted">{sub}</div>}</div>
    </div>
  );
}
import { MEDIA } from "@/config/media";

export const dynamic = "force-dynamic";

const usd = (n: number | null) => (n == null ? "—" : `$${n.toFixed(n < 1 ? 3 : 2)}`);
const inr = (n: number | null) => (n == null ? "" : `≈ ₹${Math.round(n * COSTS.inrPerUsd).toLocaleString("en-IN")}`);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Math.min(365, Math.max(1, Number((await searchParams).days) || 30));
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const s = services();
  const [calls, leads, notifications] = await Promise.all([s.repo.listCalls({ since, limit: 5000 }), s.repo.listLeads({ since, limit: 5000 }), s.repo.listNotifications({ since })]);
  const m = computeMetrics(calls, leads, notifications);
  const portal = env.hubspotPortalId();

  const tiles: [string, string, string?][] = [
    ["Calls", String(m.calls), `${m.answered} answered · ${m.missed} missed`],
    ["Minutes", m.minutes.toFixed(1)],
    ["Voice spend", usd(m.voiceUsd), inr(m.voiceUsd)],
    ["LLM spend", usd(m.llmUsd), inr(m.llmUsd)],
    ["Emails sent", String(m.emails), usd(m.emailUsd)],
    ["Cost per call", usd(m.costPerCallUsd), inr(m.costPerCallUsd)],
    ["Cost per qualified lead", usd(m.costPerQualifiedUsd), inr(m.costPerQualifiedUsd)],
    ["Answer rate", pct(m.answerRate)],
    ["Avg time to answer", m.avgTimeToAnswerSec == null ? "—" : `${m.avgTimeToAnswerSec.toFixed(1)}s`],
    ["Qualified → booked", pct(m.qualifiedToBookedRate), `${m.booked} of ${m.qualified}`],
  ];

  return (
    <>
      <Hero image={MEDIA.heroCosts} eyebrow="Running costs" title="Costs & performance"
        subtitle="What the assistant costs to run, and how well it answers and converts.">
        <form method="get" className="inline" style={{ marginLeft: 0, marginTop: 14 }}>
          <select name="days" defaultValue={String(days)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
          </select>
          <button>Show</button>
        </form>
      </Hero>
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0a4c9c" /><stop offset=".55" stopColor="#1793FF" /><stop offset="1" stopColor="#5eead4" /></linearGradient></defs>
      </svg>
      <div className="rings rise" style={{ ["--i" as string]: 2 }}>
        <Ring value={m.answerRate} label="Answer rate" sub={`${m.answered} of ${m.calls} calls`} />
        <Ring value={m.qualifiedToBookedRate} label="Qualified → booked" sub={`${m.booked} of ${m.qualified} qualified`} />
        <Ring value={m.calls ? m.qualified / Math.max(1, Object.values(m.verdicts).reduce((a, b) => a + b, 0)) : null} label="Qualified share" sub="of all enquiries" />
      </div>
      <div className="tiles">{tiles.map(([k, v, sub], i) => (
        <div className="tile glow tilt rise" style={{ ["--i" as string]: i + 3 }} key={k}>
          <div className="tile-label">{k}</div><div className="tile-value"><CountUp value={v} /></div>{sub && <div className="small muted">{sub}</div>}
        </div>
      ))}</div>
      <section className="card glow rise" style={{ ["--i" as string]: 8 }}>
        <h2>Verdicts</h2>
        {(() => {
          const parts = [
            { k: "qualified", label: "Qualified", color: "#2e8b57" }, { k: "escalate", label: "Escalated", color: "#e76f51" },
            { k: "declined", label: "Declined", color: "#6b8682" }, { k: "pending", label: "Pending", color: "#b7c3c1" },
          ];
          const total = parts.reduce((a, p) => a + (m.verdicts[p.k] ?? 0), 0);
          return total === 0 ? <p className="muted">No enquiries in this period yet.</p> : (
            <>
              <div className="split" role="img" aria-label={parts.map((p) => `${p.label} ${m.verdicts[p.k] ?? 0}`).join(", ")}>
                {parts.filter((p) => (m.verdicts[p.k] ?? 0) > 0).map((p, i) => (
                  <span key={p.k} title={`${p.label}: ${m.verdicts[p.k]}`} style={{ flex: m.verdicts[p.k], background: p.color, animationDelay: `${0.3 + i * 0.15}s` }} />
                ))}
              </div>
              <div className="legend">{parts.map((p) => <span key={p.k}><i style={{ background: p.color }} />{p.label} <b>{m.verdicts[p.k] ?? 0}</b></span>)}</div>
            </>
          );
        })()}
        <p className="small muted">
          Vendor costs only. Voice cost comes from the provider when it reports one, otherwise minutes × VOICE_USD_PER_MINUTE
          ({COSTS.voiceUsdPerMinute ? `$${COSTS.voiceUsdPerMinute}/min` : "not set"}). The sales funnel after the consultation lives in HubSpot.
        </p>
        {portal && <p><a className="btn btn-sea" href={`https://app.hubspot.com/contacts/${portal}/objects/0-3/views/all/board`} target="_blank" rel="noreferrer">Open the HubSpot deal board →</a></p>}
      </section>
    </>
  );
}
