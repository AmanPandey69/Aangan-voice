import Link from "next/link";
import { services } from "@/lib/container";
import type { LeadRow, ReviewReason } from "@/lib/db/types";
import { fmtDate, Hero, VerdictBadge } from "@/app/ui";
import { MEDIA } from "@/config/media";

export const dynamic = "force-dynamic";

const GROUPS: { reason: ReviewReason; title: string; hint: string }[] = [
  { reason: "escalation", title: "Escalations", hint: "Complaints, requests for a person. Call back now." },
  { reason: "needs_manual_booking", title: "Needs manual booking", hint: "Qualified, but no slot was booked on the call." },
  { reason: "unacknowledged_handoff", title: "Unacknowledged handoffs", hint: "The designer hasn't clicked Acknowledge." },
  { reason: "budget_review", title: "Budget review", hint: "Volunteered budget may not fit; the agent did not book." },
  { reason: "verdict_mismatch", title: "Verdict mismatch", hint: "Live call verdict differs from the post-call verdict." },
  { reason: "price_leak", title: "Possible price said by agent", hint: "Check the transcript and fix the prompt." },
  { reason: "extraction_failed", title: "Extraction failed", hint: "Read the transcript and decide manually." },
  { reason: "small_commercial", title: "Small commercial", hint: "Below the commercial minimum (a config flag). Confirm the decline." },
  { reason: "unclear", title: "Unclear after the call", hint: "Qualified with notes; a criterion was never confirmed." },
  { reason: "unknown_locality", title: "Unknown locality", hint: "Not on the service-area list. Add it in config/localities.ts if it's in Pune/PCMC." },
  { reason: "declined", title: "Declined", hint: "Check nothing good was turned away." },
  { reason: "missed_call", title: "Missed or dropped calls", hint: "No conversation. Call back." },
];

export default async function ReviewPage() {
  const s = services();
  const [leads, dead] = await Promise.all([s.repo.listLeads({ needsReview: true }), s.repo.listDeadLetters(20)]);
  const by = (r: ReviewReason) => leads.filter((l) => l.review_reasons.includes(r));

  return (
    <>
      <Hero
        image={MEDIA.heroReview}
        eyebrow="Needs a person"
        title="Review queue"
        subtitle="Escalations, manual bookings, unacknowledged handoffs and anything the rules weren't sure about."
        stats={[{ label: "open", value: leads.length }, { label: "failed jobs", value: dead.length }]}
      />
      {GROUPS.map(({ reason, title, hint }, gi) => {
        const rows = by(reason);
        if (!rows.length) return null;
        return (
          <section className="card glow rise" style={{ ["--i" as string]: gi + 2 }} key={reason}>
            <h2>{title} <span className="count">{rows.length}</span></h2>
            <p className="small muted">{hint}</p>
            <ReviewTable rows={rows} />
          </section>
        );
      })}
      {leads.length === 0 && <section className="card"><h2>All clear</h2><p className="muted">Nothing needs a person right now.</p></section>}
      {dead.length > 0 && (
        <section className="card warn">
          <h2>Failed jobs (dead letters) <span className="count">{dead.length}</span></h2>
          <table className="table compact"><tbody>{dead.map((d) => (
            <tr key={d.id}><td>{fmtDate(d.created_at)}</td><td>{d.kind}</td><td className="small">{d.error}</td><td>{d.attempts} tries</td></tr>
          ))}</tbody></table>
        </section>
      )}
    </>
  );
}

function ReviewTable({ rows }: { rows: LeadRow[] }) {
  return (
    <div className="table-wrap"><table className="table compact"><tbody>{rows.map((l) => (
      <tr key={l.id}>
        <td><Link href={`/calls/${l.id}`}>{l.name ?? l.phone}</Link></td>
        <td>{l.locality ?? "—"}</td>
        <td><VerdictBadge verdict={l.verdict} urgent={l.urgent} /></td>
        <td className="small">{l.reason ?? ""}</td>
        <td className="small">{fmtDate(l.last_call_at)}</td>
      </tr>
    ))}</tbody></table></div>
  );
}
