import { z } from "zod";
import { handleTool } from "@/lib/http/tools";
import { formatSlot } from "@/lib/handoff/email";
import { normalisePhone } from "@/lib/phone";
import { findOrCreateLead } from "@/lib/pipeline/process-call";
import { logError } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const Args = z.object({
  slot_start: z.string(),
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  locality: z.string().optional(),
  notes: z.string().optional(),
});

/** Mid-call: book the consultation. On failure, record the preferred time for a manual booking. */
export async function POST(req: Request) {
  return handleTool(req, async (s, { callId, callerPhone, args }) => {
    const a = Args.safeParse(args);
    const phone = normalisePhone((a.success && a.data.phone) || callerPhone);
    if (!phone) return { ok: false, say: "Could I have the best phone number to reach you on?" };
    const lead = await findOrCreateLead(s, phone);
    const preferred = a.success ? a.data.slot_start : String((args as { slot_start?: unknown }).slot_start ?? "");

    if (!a.success || Number.isNaN(Date.parse(a.data.slot_start))) {
      await s.repo.updateLead(lead.id, { booking_status: "needs_manual_booking", preferred_time_raw: preferred || null });
      return { ok: false, say: "I've noted the time you'd like. A team member will call you today to confirm the consultation." };
    }
    try {
      const b = await s.calendar.book({
        start: a.data.slot_start, name: a.data.name, phone, email: a.data.email || null,
        locality: a.data.locality ?? null, notes: a.data.notes ?? null, leadId: lead.id, timeZone: "Asia/Kolkata",
      });
      await s.repo.upsertBooking({ lead_id: lead.id, provider: s.calendar.name, provider_booking_id: b.bookingId,
        start_at: b.start, end_at: b.end, status: "accepted", attendee_email: a.data.email || null, attendee_phone: phone });
      await s.repo.updateLead(lead.id, {
        booking_status: "booked", booked_slot: b.start, name: lead.name ?? a.data.name,
        email: lead.email ?? (a.data.email || null), locality: lead.locality ?? a.data.locality ?? null,
      });
      if (lead.verdict) await s.repo.enqueueJob("notify", { leadId: lead.id });
      return { ok: true, booking_id: b.bookingId, start: b.start, spoken: formatSlot(b.start) };
    } catch (err) {
      logError("tools.book-slot", err, { callId, lead: lead.id });
      await s.repo.updateLead(lead.id, { booking_status: "needs_manual_booking", preferred_time_raw: formatSlot(a.data.slot_start) });
      return { ok: false, say: "I'm sorry, I couldn't confirm that slot just now. I've noted your preferred time, and a team member will call you today to confirm it." };
    }
  });
}
