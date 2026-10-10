import { after } from "next/server";
import { services } from "@/lib/container";
import { runMaintenance } from "@/lib/pipeline/jobs";
import { json, logError, parseJson } from "@/lib/http/respond";
import { normalisePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** BOOKING_CREATED → link the booking to the lead and send the handoff email (once the call is processed). */
export async function POST(req: Request) {
  const s = services();
  const raw = await req.text();
  if (!s.calendar.verifyWebhook(raw, req.headers)) return json({ error: "invalid signature" }, 401);
  const payload = parseJson(raw);
  if (payload === undefined) return json({ error: "invalid json" }, 400);

  const ev = s.calendar.parseWebhook(payload);
  const { row, duplicate } = await s.repo.saveWebhookEvent({
    source: "calcom", event_type: ev?.type ?? null, external_id: ev?.eventId ?? null, payload, signature_valid: true,
  });
  if (!ev || duplicate) return json({ ok: true, ignored: !ev, duplicate });

  try {
    let lead = ev.leadId ? await s.repo.getLead(ev.leadId) : null;
    const phone = normalisePhone(ev.attendeePhone);
    if (!lead && phone) lead = await s.repo.findLeadByPhone(phone);
    if (!lead && ev.attendeeEmail) {
      // Email alone is weak (people reuse emails, and the booking arrives before the call is saved):
      // only link when the name agrees too. Otherwise the call that made it claims it when processed.
      const email = ev.attendeeEmail.toLowerCase();
      const first = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      lead = (await s.repo.listLeads({ search: email, limit: 20 }))
        .find((l) => l.email?.toLowerCase() === email && !!ev.attendeeName && first(l.name) === first(ev.attendeeName)) ?? null;
    }

    if (ev.type === "booking_created" || ev.type === "booking_rescheduled") {
      await s.repo.upsertBooking({ lead_id: lead?.id ?? null, provider: s.calendar.name, provider_booking_id: ev.bookingId,
        start_at: ev.start ?? new Date().toISOString(), end_at: ev.end, status: "accepted",
        attendee_email: ev.attendeeEmail, attendee_phone: phone });
      if (lead && ev.start) {
        await s.repo.updateLead(lead.id, {
          booking_status: "booked", booked_slot: ev.start,
          review_reasons: lead.review_reasons.filter((r) => r !== "needs_manual_booking"),
        });
        await s.repo.enqueueJob("notify", { leadId: lead.id });
      }
    } else if (ev.type === "booking_cancelled") {
      await s.repo.upsertBooking({ lead_id: lead?.id ?? null, provider: s.calendar.name, provider_booking_id: ev.bookingId,
        start_at: ev.start ?? new Date().toISOString(), end_at: ev.end, status: "cancelled",
        attendee_email: ev.attendeeEmail, attendee_phone: phone });
      if (lead) await s.repo.updateLead(lead.id, { booking_status: "cancelled", booked_slot: null });
    }
    await s.repo.markWebhookProcessed(row.id);
  } catch (err) {
    logError("calcom.webhook", err, { event: row.id });
    await s.repo.markWebhookProcessed(row.id, err instanceof Error ? err.message : String(err));
    return json({ error: "processing failed" }, 500); // let Cal.com retry
  }
  after(async () => { try { await runMaintenance(s); } catch (err) { logError("calcom.after", err); } });
  return json({ ok: true });
}
