import type { Services } from "@/lib/container";
import type { NormalizedCall } from "@/lib/adapters/voice/types";
import type { LeadRow, NewLead } from "@/lib/db/types";
import { evaluate } from "@/lib/rules/engine";
import { extractLead } from "@/lib/extraction/extract";
import { agentLines, findPriceLeaks } from "@/lib/guard/price-guard";
import { normalisePhone } from "@/lib/phone";
import { mergeFacts } from "./merge";
import { reviewReasons } from "./review";

export type ProcessOutcome =
  | { status: "duplicate"; callId: string }
  | { status: "no_conversation"; callId: string; leadId: string }
  | { status: "extraction_failed"; callId: string; leadId: string }
  | { status: "processed"; callId: string; leadId: string; verdict: string };

/** Fewer caller words than this is a missed/dropped call, not an enquiry (T08, first T17 call). */
const MIN_CALLER_WORDS = 12;

function callerText(transcript: string): string {
  return transcript.split("\n").filter((l) => /^(caller|user|customer|human)\s*:/i.test(l)).map((l) => l.replace(/^[^:]+:\s*/, "")).join(" ");
}

const blankLead = (phone: string): NewLead => ({
  phone, channel: "phone", name: null, email: null, locality: null, facts: {}, verdict: null, urgent: false,
  reason: null, criteria: null, flags: [], uncertainties: [], live_verdict: null, verdict_mismatch: false,
  price_leak: false, booking_status: "none", booked_slot: null, preferred_time_raw: null,
  hubspot_contact_id: null, hubspot_deal_id: null, review_reasons: [], review_resolved_at: null, extraction_failed: false,
});

/** Find the lead for this phone or create it; tolerates a concurrent insert for the same number. */
export async function findOrCreateLead(s: Services, phone: string): Promise<LeadRow> {
  const existing = await s.repo.findLeadByPhone(phone);
  if (existing) return existing;
  try {
    return await s.repo.insertLead(blankLead(phone));
  } catch {
    const again = await s.repo.findLeadByPhone(phone);
    if (again) return again;
    throw new Error(`could not create lead for ${phone}`);
  }
}

/**
 * The post-call pipeline:
 * transcript → extraction (retry once, then flag) → rules engine → compare
 * with the live verdict → dedupe by phone → save → queue CRM sync and the
 * handoff email.
 */
export async function processCall(s: Services, incoming: NormalizedCall, webhookEventId: string | null): Promise<ProcessOutcome> {
  const { repo } = s;
  const prior = await repo.getCallByProviderId(incoming.providerCallId);
  if (prior?.processed_at) return { status: "duplicate", callId: prior.id };
  let call: NormalizedCall = { ...incoming, callerPhone: incoming.callerPhone ?? prior?.caller_phone ?? null };
  if (s.voice.enrich) call = await s.voice.enrich(call);

  const callRow = await repo.upsertCall({
    provider_call_id: call.providerCallId, lead_id: prior?.lead_id ?? null, channel: "phone",
    caller_phone: call.callerPhone, started_at: call.startedAt, ended_at: call.endedAt, duration_sec: call.durationSec,
    status: call.status, transcript: call.transcript || null, recording_url: call.recordingUrl,
    live_verdict: call.liveVerdict ?? prior?.live_verdict ?? null, ring_sec: call.ringSec, voice_cost_usd: call.costUsd ?? 0,
    llm_cost_usd: 0, llm_input_tokens: 0, llm_output_tokens: 0, extraction_status: "pending",
    webhook_event_id: webhookEventId, processed_at: null,
  });

  const phone = normalisePhone(call.callerPhone) ?? `unknown:${call.providerCallId}`;
  let lead = await findOrCreateLead(s, phone);
  const at = call.startedAt ?? new Date().toISOString();

  // Missed call, or dropped before the caller said anything useful.
  if (call.status === "missed" || callerText(call.transcript).split(/\s+/).filter((w) => /\w/.test(w)).length < MIN_CALLER_WORDS) {
    if (!lead.verdict) {
      const reasons = Array.from(new Set([...lead.review_reasons, "missed_call" as const]));
      lead = await repo.updateLead(lead.id, { review_reasons: reasons, review_resolved_at: null, last_call_at: at });
    }
    await repo.updateCall(callRow.id, { lead_id: lead.id, extraction_status: "skipped", processed_at: new Date().toISOString() });
    return { status: "no_conversation", callId: callRow.id, leadId: lead.id };
  }

  const extraction = await extractLead(s.llm, {
    transcript: call.transcript, callStartedAt: at, callerPhone: phone, callId: call.providerCallId,
  });
  const usage = extraction.usage.reduce((a, u) => ({ cost: a.cost + u.costUsd, in: a.in + u.inputTokens, out: a.out + u.outputTokens }), { cost: 0, in: 0, out: 0 });
  await repo.updateCall(callRow.id, { llm_cost_usd: usage.cost, llm_input_tokens: usage.in, llm_output_tokens: usage.out, lead_id: lead.id });

  const priceLeak = agentLines(call.transcript).some((l) => findPriceLeaks(l).length > 0);

  if (!extraction.ok) {
    const patch = { extraction_failed: true, price_leak: lead.price_leak || priceLeak, last_call_at: at };
    const reasons = reviewReasons({ ...lead, ...patch }, null);
    await repo.updateLead(lead.id, { ...patch, review_reasons: Array.from(new Set([...lead.review_reasons.filter((r) => r !== "missed_call"), ...reasons])), review_resolved_at: null });
    await repo.updateCall(callRow.id, { extraction_status: "failed", processed_at: new Date().toISOString() });
    return { status: "extraction_failed", callId: callRow.id, leadId: lead.id };
  }

  const facts = mergeFacts(lead.facts, extraction.facts);
  const ev = evaluate(facts, { now: new Date(at), mode: "final" });

  const liveVerdict = callRow.live_verdict;
  const verdictMismatch = Boolean(liveVerdict && liveVerdict !== ev.verdict);

  // A booking made by the voice platform's own Cal.com integration may have arrived before this lead existed.
  for (const b of await repo.findUnlinkedBookings(lead.phone, facts.email ?? lead.email)) await repo.linkBooking(b.id, lead.id);
  const bookings = await repo.listBookingsForLead(lead.id);
  const active = bookings.filter((b) => b.status !== "cancelled").sort((a, b) => b.start_at.localeCompare(a.start_at))[0];
  const bookingStatus: LeadRow["booking_status"] = active ? "booked"
    : ev.verdict === "qualified" ? "needs_manual_booking"
    : lead.booking_status === "needs_manual_booking" ? "needs_manual_booking" : "not_offered";

  const patch: Partial<LeadRow> = {
    name: facts.name ?? lead.name, email: facts.email ?? lead.email, locality: facts.locality ?? lead.locality,
    facts, verdict: ev.verdict, urgent: ev.urgent, reason: ev.escalation_reason ?? ev.reason, criteria: ev.criteria,
    flags: ev.flags, uncertainties: ev.uncertainties, live_verdict: liveVerdict, verdict_mismatch: verdictMismatch,
    price_leak: lead.price_leak || priceLeak, booking_status: bookingStatus, booked_slot: active?.start_at ?? null,
    preferred_time_raw: facts.preferred_time_raw ?? lead.preferred_time_raw, extraction_failed: false, last_call_at: at,
  };
  const reasons = reviewReasons({ ...lead, ...patch } as LeadRow, ev);
  lead = await repo.updateLead(lead.id, { ...patch, review_reasons: reasons, review_resolved_at: reasons.length ? null : lead.review_resolved_at });

  await repo.updateCall(callRow.id, { extraction_status: "ok", processed_at: new Date().toISOString() });
  await repo.enqueueJob("crm_sync", { leadId: lead.id });
  await repo.enqueueJob("notify", { leadId: lead.id });
  return { status: "processed", callId: callRow.id, leadId: lead.id, verdict: ev.verdict };
}
