import { services } from "@/lib/container";
import { computeMetrics } from "@/lib/metrics";
import { COSTS } from "@/config/costs";
import { env } from "@/lib/env";
import { Hero } from "@/app/ui";
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
      <div className="tiles">{tiles.map(([k, v, sub]) => (
        <div className="tile" key={k}><div className="tile-label">{k}</div><div className="tile-value">{v}</div>{sub && <div className="small muted">{sub}</div>}</div>
      ))}</div>
      <section className="card">
        <h2>Verdicts</h2>
        <p>{Object.entries(m.verdicts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
        <p className="small muted">
          Vendor costs only. Voice cost comes from the provider when it reports one, otherwise minutes × VOICE_USD_PER_MINUTE
          ({COSTS.voiceUsdPerMinute ? `$${COSTS.voiceUsdPerMinute}/min` : "not set"}). The sales funnel after the consultation lives in HubSpot.
        </p>
        {portal && <p><a className="btn btn-sea" href={`https://app.hubspot.com/contacts/${portal}/objects/0-3/views/all/board`} target="_blank" rel="noreferrer">Open the HubSpot deal board →</a></p>}
      </section>
    </>
  );
}
