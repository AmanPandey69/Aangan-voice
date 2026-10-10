import Link from "next/link";
import { notFound } from "next/navigation";
import { services } from "@/lib/container";
import type { CriterionKey } from "@/lib/domain/lead";
import { fmtDate, fmtDuration, Hero, ScoreRing, StatusPill, VerdictBadge } from "@/app/ui";
import { fitScore } from "@/lib/insights";
import { acknowledgeLead, resolveReview } from "./actions";
import { Tabs, CopyButton } from "./tabs";
import { env } from "@/lib/env";
import { roomPhoto } from "@/config/media";
import { propertyLabel } from "@/lib/handoff/email";
import { briefText, googleCalendarHref, prepQuestions, telHref, whatsappHref } from "@/lib/handoff/brief";
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

  const dash = `${env.appBaseUrl}/calls/${lead.id}`;
  const tel = telHref(lead), wa = whatsappHref(lead), gcal = googleCalendarHref(lead, dash);
  const unacked = handoff.some((n) => !n.acknowledged_at);
  const key: [string, string][] = [
    ["Phone", displayPhone(lead.phone)],
    ["Area", lead.locality ?? "—"],
    ["Home", [propertyLabel(f), f.carpet_area_sqft ? `${f.carpet_area_sqft} sq ft` : null].filter(Boolean).join(" · ") || "—"],
    ["Scope", f.scope_rooms?.length ? f.scope_rooms.join(", ") : f.scope_type?.replace(/_/g, " ") ?? "—"],
    ["Timeline", f.timeline_raw ?? "—"],
    ["Consultation", lead.booked_slot ? fmtDate(lead.booked_slot) : lead.booking_status === "needs_manual_booking" ? "Not booked: call them" : "—"],
  ];

  const overview = (
    <>
      <div className="prep rise" style={{ ["--i" as string]: 3 }}>
        <h2>✨ What to ask them</h2>
        <ol>{prepQuestions(lead).map((q) => <li key={q}>{q}</li>)}</ol>
      </div>
      <dl className="keyfacts">{key.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div className="card">
        <h2>Why it&apos;s {lead.verdict ?? "pending"}</h2>
        <p className="muted small" style={{ marginTop: -4 }}>{lead.reason ?? "Not processed yet."}{lead.live_verdict ? ` · Live verdict: ${lead.live_verdict}${lead.verdict_mismatch ? " (mismatch)" : ""}` : ""}</p>
        {lead.criteria && (
          <div className="rule-chips">{(Object.keys(CRITERIA) as CriterionKey[]).map((k) => {
            const c = lead.criteria![k];
            return <span key={k} className={`rule-chip ${c.status}`} title={c.reason}>{c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "?"} {CRITERIA[k].replace(/^\d\. /, "")}</span>;
          })}</div>
        )}
        {lead.price_leak && <p className="error">The agent may have said a price on this call. Check the conversation.</p>}
        {lead.extraction_failed && <p className="error">Automatic notes failed. Read the conversation and decide manually.</p>}
      </div>
    </>
  );

  const conversation = (
    <>
      {calls.map((c) => (
        <section className="card" key={c.id}>
          <h2>{fmtDate(c.started_at)} · {fmtDuration(c.duration_sec)}</h2>
          {c.recording_url ? <audio className="player" controls preload="none" src={c.recording_url} /> : <p className="muted small">No recording for this call.</p>}
          {c.transcript ? (
            <div className="transcript">{c.transcript.split("\n").map((line, i) => {
              const [who, ...rest] = line.split(":");
              return <p key={i} className={/^agent/i.test(who) ? "t-agent" : "t-caller"}><b>{/^agent/i.test(who) ? "Assistant" : "Caller"}:</b>{rest.join(":")}</p>;
            })}</div>
          ) : <p className="muted">No transcript.</p>}
        </section>
      ))}
      {calls.length === 0 && <div className="empty-state">No calls recorded.</div>}
    </>
  );

  const details = (
    <>
      <section className="card">
        <h2>Everything we know</h2>
        <dl className="facts">{facts.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v === null || v === undefined || v === "" ? "—" : String(v)}</dd></div>))}</dl>
      </section>
      <section className="card">
        <h2>Rules, one by one</h2>
        <div className="criteria">{lead.criteria ? (Object.keys(CRITERIA) as CriterionKey[]).map((k) => {
          const c = lead.criteria![k];
          return (
            <div key={k} className={`criterion ${c.status}`}>
              <span className="ico" aria-hidden="true">{c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "?"}</span>
              <span><b>{CRITERIA[k]}</b><small>{c.reason}</small></span>
              <StatusPill value={c.status} />
            </div>
          );
        }) : <p className="muted">Not evaluated yet.</p>}</div>
      </section>
      <section className="card">
        <h2>Emails, booking and CRM</h2>
        {bookings.map((b) => <p key={b.id}>📅 {fmtDate(b.start_at)} · <StatusPill value={b.status} /> <span className="small muted">{b.provider} {b.provider_booking_id}</span></p>)}
        {notifications.length ? (
          <table className="table compact"><tbody>{notifications.map((n) => (
            <tr key={n.id}>
              <td className="small">{n.subject}</td>
              <td><StatusPill value={n.status} /></td>
              <td className="small">{n.sent_at ? `sent ${fmtDate(n.sent_at)}` : n.error ?? ""}{n.opened_at ? " · opened" : ""}</td>
              <td className="small">{n.kind === "reminder" ? "" : n.acknowledged_at ? `✓ ${fmtDate(n.acknowledged_at)}` : <span className="error">not acknowledged</span>}</td>
            </tr>
          ))}</tbody></table>
        ) : <p className="muted">No emails sent.</p>}
        <p className="small">{lead.hubspot_deal_id && crmUrl ? <a className="act" href={crmUrl} target="_blank" rel="noreferrer">Open deal in HubSpot →</a> : lead.hubspot_contact_id ? "In HubSpot" : "Not in HubSpot yet"}</p>
      </section>
    </>
  );

  return (
    <>
      <p className="rise" style={{ margin: "0 0 12px" }}><Link href="/calls" className="act">← All enquiries</Link></p>
      <Hero compact image={roomPhoto(lead.id, 2000)}
        eyebrow={[lead.locality, f.bhk ? `${f.bhk}BHK` : null, f.property_type?.replace(/_/g, " ")].filter(Boolean).join(" · ") || "Enquiry"}
        title={lead.name ?? "Unknown caller"} subtitle={f.summary || undefined}
        stats={fitScore(lead.criteria) == null ? undefined : [{ label: "fit out of 100", value: <ScoreRing score={fitScore(lead.criteria)} size={64} /> }]}>
        <div className="actions on-photo" style={{ marginTop: 16 }}>
          {tel && <a className="act" href={tel}>📞 Call</a>}
          {wa && <a className="act" href={wa} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
          {gcal && <a className="act" href={gcal} target="_blank" rel="noreferrer">📅 Add to Google Calendar</a>}
          <CopyButton text={briefText(lead, dash)} />
          {unacked && <form action={acknowledgeLead.bind(null, lead.id)}><button className="act primary">✓ Acknowledge</button></form>}
        </div>
      </Hero>

      <Journey steps={journey} />

      {openReview && (
        <div className="card warn rise" style={{ ["--i" as string]: 2 }}>
          <strong>Needs a look:</strong> {lead.review_reasons.map((r) => r.replace(/_/g, " ")).join(", ")}
          <form action={resolveReview.bind(null, lead.id)} className="inline"><button className="btn-sea">✓ Mark resolved</button></form>
        </div>
      )}

      <Tabs tabs={[
        { key: "overview", label: "Overview", content: overview },
        { key: "conversation", label: `Conversation${calls.length > 1 ? ` (${calls.length})` : ""}`, content: conversation },
        { key: "details", label: "Details", content: details },
      ]} />
    </>
  );
}
