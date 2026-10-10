import { hmacHex, safeEqual } from "@/lib/security/hmac";
import type { BookingRequest, BookingResult, CalendarProvider, CalendarWebhookEvent, Slot } from "./types";

/**
 * Cal.com API v2. Sources, checked 2026-10-08:
 *  - Slots:    https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type
 *  - Bookings: https://cal.com/docs/api-reference/v2/bookings/create-a-booking
 *  - Webhooks: https://cal.com/docs/developing/guides/automation/webhooks
 */
const API = "https://api.cal.com/v2";
const SLOTS_VERSION = "2024-09-04";
const BOOKINGS_VERSION = "2026-02-25";

export class CalcomCalendar implements CalendarProvider {
  readonly name = "calcom";
  constructor(private apiKey: string, private eventTypeId: string, private webhookSecret: string) {}

  private headers(version: string) {
    return { Authorization: `Bearer ${this.apiKey}`, "cal-api-version": version, "Content-Type": "application/json" };
  }

  async getAvailability(fromIso: string, toIso: string, timeZone: string): Promise<Slot[]> {
    const q = new URLSearchParams({ eventTypeId: this.eventTypeId, start: fromIso, end: toIso, timeZone, format: "range" });
    const res = await fetch(`${API}/slots?${q}`, { headers: this.headers(SLOTS_VERSION), signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`cal.com slots ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, (string | { start: string; end?: string })[]> };
    return Object.values(body.data ?? {}).flat().map((s) => typeof s === "string"
      ? { start: new Date(s).toISOString(), end: "" }
      : { start: new Date(s.start).toISOString(), end: s.end ? new Date(s.end).toISOString() : "" })
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  /**
   * The schema makes attendee email optional. If your event type requires an
   * email field, bookings without one fail and the lead falls back to
   * "needs manual booking" (make email optional in the event type to avoid that).
   */
  async book(req: BookingRequest): Promise<BookingResult> {
    const attendee: Record<string, string> = { name: req.name, timeZone: req.timeZone, language: "en" };
    if (req.email) attendee.email = req.email;
    if (req.phone) attendee.phoneNumber = req.phone;
    const metadata: Record<string, string> = { source: "aangan_phone_agent" };
    if (req.leadId) metadata.lead_id = req.leadId;
    if (req.locality) metadata.locality = req.locality.slice(0, 500);

    const res = await fetch(`${API}/bookings`, {
      method: "POST", headers: this.headers(BOOKINGS_VERSION), signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        start: new Date(req.start).toISOString(), eventTypeId: Number(this.eventTypeId), attendee, metadata,
        ...(req.notes ? { bookingFieldsResponses: { notes: req.notes.slice(0, 500) } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`cal.com booking ${res.status}`);
    const body = (await res.json()) as { data?: { uid?: string; id?: number; start?: string; end?: string } };
    const d = body.data;
    if (!d?.uid && d?.id == null) throw new Error("cal.com booking: no id in response");
    return { bookingId: d.uid ?? String(d.id), start: d.start ?? new Date(req.start).toISOString(), end: d.end ?? null };
  }

  /**
   * Header x-cal-signature-256: HMAC-SHA256 of the payload with the webhook secret.
   * TODO(calcom): docs don't state the encoding; hex over the raw body is what
   * Cal.com's own examples compute. Verify with a test delivery after setup.
   */
  verifyWebhook(rawBody: string, headers: Headers): boolean {
    return safeEqual(headers.get("x-cal-signature-256"), hmacHex(this.webhookSecret, rawBody));
  }

  parseWebhook(payload: unknown): CalendarWebhookEvent | null {
    const p = payload as {
      triggerEvent?: string;
      payload?: {
        uid?: string; startTime?: string; endTime?: string; metadata?: Record<string, string>;
        attendees?: { email?: string; phoneNumber?: string; name?: string }[];
        responses?: Record<string, { value?: unknown }>;
      };
    };
    const b = p?.payload;
    if (!b?.uid || !p.triggerEvent) return null;
    const type = p.triggerEvent === "BOOKING_CREATED" ? "booking_created"
      : p.triggerEvent === "BOOKING_CANCELLED" ? "booking_cancelled"
      : p.triggerEvent === "BOOKING_RESCHEDULED" ? "booking_rescheduled" : "other";
    const phone = b.attendees?.[0]?.phoneNumber ?? asString(b.responses?.attendeePhoneNumber?.value) ?? asString(b.responses?.phone?.value);
    return {
      type, bookingId: b.uid, start: b.startTime ?? null, end: b.endTime ?? null,
      attendeeEmail: b.attendees?.[0]?.email ?? asString(b.responses?.email?.value),
      attendeePhone: phone, attendeeName: b.attendees?.[0]?.name ?? asString(b.responses?.name?.value), leadId: b.metadata?.lead_id ?? null, eventId: `${p.triggerEvent}:${b.uid}:${b.startTime ?? ""}`,
    };
  }
}

const asString = (v: unknown) => (typeof v === "string" && v ? v : null);
