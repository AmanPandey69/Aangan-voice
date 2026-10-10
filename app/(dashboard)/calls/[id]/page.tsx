import Link from "next/link";
import { notFound } from "next/navigation";
import { services } from "@/lib/container";
import type { CriterionKey } from "@/lib/domain/lead";
import { fmtDate, fmtDuration, Hero, StatusPill, VerdictBadge } from "@/app/ui";
import { resolveReview } from "./actions";
import { displayPhone } from "@/lib/phone";

type StepState = "done" | "warn" | "now" | "todo";
interface Step { icon: string; label: string; sub: string; state: StepState }

function Journey({ steps }: { steps: Step[] }) {
  return (
    <ol className="journey rise" style={{ ["--i" as string]: 1, listStyle: "none" }} aria-label="Enquiry progress">
      {steps.map((st) => (
        <li key={st.label} className={`step ${st.state === "todo" ? "" : st.state}`}>
          <div className="step-dot" aria-hidden="true">{st.icon}</div>
          <b>{st.label}</b><span>{st.sub}</span>
        </li>
      ))}
    </ol>
  );
}

export const dynamic = "force-dynamic";

const CRITERIA: Record<CriterionKey, string> = {
  real_project: "1. Real project", service_area: "2. Service area", timeline: "3. Timeline",
  budget: "4. Budget band", decision_maker: "5. Decision-maker",
};

export default async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = services();
  const lead = await s.repo.getLead(id);
  if (!lead) notFound();
  const [calls, bookings, notifications] = await Promise.all([
    s.repo.listCallsForLead(id), s.repo.listBookingsForLead(id), s.repo.listNotifications({ leadId: id }),
  ]);
  const f = lead.facts;
  const crmUrl = lead.hubspot_deal_id ? s.crm.dealUrl(lead.hubspot_deal_id) : null;
  const openReview = lead.review_reasons.length > 0 && !lead.review_resolved_at;

  const facts: [string, string | number | boolean | null | undefined][] = [
    ["Phone", displayPhone(lead.phone)], ["Email", lead.email], ["Locality", lead.locality], ["City", f.city],
    ["Property", [f.bhk ? `${f.bhk}BHK` : null, f.property_type?.replace(/_/g, " ")].filter(Boolean).join(" ")],
    ["Segment", f.segment], ["Carpet area", f.carpet_area_sqft ? `${f.carpet_area_sqft} sq ft` : null],
    ["Scope", f.scope_type?.replace(/_/g, " ")], ["Rooms", f.scope_rooms?.join(", ")],
    ["Wants execution", f.wants_execution == null ? null : f.wants_execution ? "Yes" : "No"],
    ["Property status", f.property_status?.replace(/_/g, " ")], ["Rented", f.rented == null ? null : f.rented ? "Yes" : "No"],
    ["Timeline", f.timeline_raw], ["Complete by", f.completion_by], ["Site available", f.site_available_from],
    ["Decision-maker", [f.decision_maker?.replace(/_/g, " "), f.decision_maker_note].filter(Boolean).join(" · ")],
    ["Referral / source", [f.referral, f.source].filter(Boolean).join(" · ")],
    ["Asked about price", f.price_asked ? "Yes" : "No"],
    ["Budget (caller's own words)", f.budget_volunteered ? f.budget_raw ?? "volunteered" : "Not volunteered"],
    ["Preferred time", lead.preferred_time_raw], ["Language", f.language],
  ];

  const handoff = notifications.filter((n) => n.kind !== "reminder" && n.sent_at);
  const acked = handoff.some((n) => n.acknowledged_at);
  const firstCall = calls[calls.length - 1];
  const journey: Step[] = [
    { icon: "☎", label: "Call answered", sub: firstCall ? fmtDate(firstCall.started_at) : "—", state: calls.some((c) => c.status !== "missed" && c.status !== "in_progress") ? "done" : "todo" },
    { icon: lead.verdict === "declined" ? "✕" : lead.verdict === "escalate" ? "!" : "✓", label: lead.verdict ? lead.verdict[0].toUpperCase() + lead.verdict.slice(1) : "Verdict", sub: lead.verdict ? (lead.urgent ? "urgent" : "decided") : "pending",
      state: lead.verdict === "qualified" ? "done" : lead.verdict ? "warn" : "todo" },
    { icon: "📅", label: "Booked", sub: lead.booked_slot ? fmtDate(lead.booked_slot) : lead.booking_status === "needs_manual_booking" ? "needs a call" : "—",
      state: lead.booking_status === "booked" ? "done" : lead.booking_status === "needs_manual_booking" ? "warn" : "todo" },
    { icon: "◆", label: "HubSpot", sub: lead.hubspot_contact_id ? "synced" : "—", state: lead.hubspot_contact_id ? "done" : "todo" },
    { icon: "✉", label: "Emailed", sub: handoff[0]?.sent_at ? fmtDate(handoff[0].sent_at) : "—", state: handoff.length ? "done" : "todo" },
    { icon: "👍", label: "Acknowledged", sub: acked ? "by designer" : handoff.length ? "waiting" : "—", state: acked ? "done" : handoff.length ? "now" : "todo" },
  ];

  return (
    <>
      <p className="rise"><Link href="/calls" className="btn btn-secondary">← All enquiries</Link></p>
      <Hero compact eyebrow={[lead.locality, f.bhk ? `${f.bhk}BHK` : null, f.property_type?.replace(/_/g, " ")].filter(Boolean).join(" · ") || "Enquiry"}
        title={lead.name ?? "Unknown caller"} subtitle={f.summary || undefined}>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <span style={{ background: "#fff", borderRadius: 999 }}><VerdictBadge verdict={lead.verdict} urgent={lead.urgent} /></span>
          <span style={{ background: "#fff", borderRadius: 999 }}><StatusPill value={lead.booking_status} /></span>
        </div>
      </Hero>

      <Journey steps={journey} />

      {openReview && (
        <div className="card warn">
          <strong>In review queue:</strong> {lead.review_reasons.map((r) => r.replace(/_/g, " ")).join(", ")}
          <form action={resolveReview.bind(null, lead.id)} className="inline"><button className="btn-sea">✓ Mark resolved</button></form>
        </div>
      )}

      <div className="grid2">
        <section className="card accent glow rise" style={{ ["--i" as string]: 2 }}>
          <h2>Verdict</h2>
          <p><strong>{lead.verdict ?? "pending"}</strong> — {lead.reason ?? "not processed yet"}</p>
          {lead.live_verdict && <p className="small muted">Live verdict during call: {lead.live_verdict}{lead.verdict_mismatch ? " (MISMATCH)" : ""}</p>}
          {lead.criteria && (
            <div className="criteria">{(Object.keys(CRITERIA) as CriterionKey[]).map((k, i) => {
              const c = lead.criteria![k];
              return (
                <div key={k} className={`criterion ${c.status} rise`} style={{ ["--i" as string]: i + 3 }}>
                  <span className="ico" aria-hidden="true">{c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "?"}</span>
                  <span><b>{CRITERIA[k]}</b><small>{c.reason}</small></span>
                  <StatusPill value={c.status} />
                </div>
              );
            })}</div>
          )}
          {lead.flags.length > 0 && <p className="small">Flags: {lead.flags.map((x) => x.replace(/_/g, " ")).join(", ")}</p>}
          {lead.uncertainties.length > 0 && <p className="small">Uncertainties: {lead.uncertainties.join("; ")}</p>}
          {lead.price_leak && <p className="error">The agent may have said a price on this call. Check the transcript.</p>}
          {lead.extraction_failed && <p className="error">Automatic extraction failed. Read the transcript and decide manually.</p>}
        </section>

        <section className="card accent glow rise" style={{ ["--i" as string]: 3 }}>
          <h2>Booking &amp; follow-up</h2>
          {bookings.length ? bookings.map((b) => (
            <p key={b.id}>{fmtDate(b.start_at)} · <StatusPill value={b.status} /> <span className="small muted">{b.provider} {b.provider_booking_id}</span></p>
          )) : <p className="muted">No booking.{lead.booking_status === "needs_manual_booking" ? ` Needs manual booking — preferred: ${lead.preferred_time_raw ?? "not stated"}.` : ""}</p>}
          <h3>Emails</h3>
          {notifications.length ? (
            <table className="table compact"><tbody>{notifications.map((n) => (
              <tr key={n.id}>
                <td className="small">{n.subject}</td>
                <td><StatusPill value={n.status} /></td>
                <td className="small">{n.sent_at ? `sent ${fmtDate(n.sent_at)}` : n.error ?? ""}{n.opened_at ? ` · opened` : ""}</td>
                <td className="small">{n.kind === "reminder" ? "" : n.acknowledged_at ? `ack ${fmtDate(n.acknowledged_at)}` : <span className="error">not acknowledged</span>}</td>
              </tr>
            ))}</tbody></table>
          ) : <p className="muted">No emails sent.</p>}
          <h3>CRM</h3>
          <p className="small">{lead.hubspot_deal_id ? <>{crmUrl ? <a className="btn btn-soft" href={crmUrl} target="_blank" rel="noreferrer">Open deal in HubSpot →</a> : <>HubSpot deal {lead.hubspot_deal_id}</>}</> : "Not synced yet"}</p>
        </section>
      </div>

      <section className="card glow rise" style={{ ["--i" as string]: 4 }}>
        <h2>Extracted details</h2>
        <dl className="facts">{facts.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v === null || v === undefined || v === "" ? "—" : String(v)}</dd></div>))}</dl>
      </section>

      {calls.map((c) => (
        <section className="card glow rise" style={{ ["--i" as string]: 5 }} key={c.id}>
          <h2>Call {fmtDate(c.started_at)} · {fmtDuration(c.duration_sec)} · <StatusPill value={c.status} /></h2>
          <p className="small">
            {c.recording_url ? <a className="btn btn-soft" href={c.recording_url} target="_blank" rel="noreferrer">▶ Recording</a> : "No recording"}
            {" · "}extraction {c.extraction_status} · voice ${Number(c.voice_cost_usd).toFixed(3)} · LLM ${Number(c.llm_cost_usd).toFixed(4)}
          </p>
          {c.transcript ? (
            <div className="transcript">{c.transcript.split("\n").map((line, i) => {
              const [who, ...rest] = line.split(":");
              return <p key={i} className={`${/^agent/i.test(who) ? "t-agent" : "t-caller"} rise`} style={{ ["--i" as string]: Math.min(i, 12) + 5 }}><b>{who}:</b>{rest.join(":")}</p>;
            })}</div>
          ) : <p className="muted">No transcript.</p>}
        </section>
      ))}
    </>
  );
}
