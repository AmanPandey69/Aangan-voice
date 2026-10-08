import { randomUUID } from "node:crypto";
import { hmacHex, safeEqual } from "@/lib/security/hmac";
import type { BookingRequest, CalendarProvider, CalendarWebhookEvent, Slot } from "./types";

/** Weekday consultation slots 11:00 and 16:00 IST; bookings kept in memory. */
export class MockCalendar implements CalendarProvider {
  readonly name = "mock";
  static booked = new Set<string>();
  static failNextBooking = false;
  constructor(private secret: string) {}

  async getAvailability(fromIso: string, toIso: string): Promise<Slot[]> {
    const slots: Slot[] = [];
    const from = new Date(fromIso), to = new Date(toIso);
    for (let d = new Date(from); d <= to && slots.length < 6; d = new Date(d.getTime() + 864e5)) {
      const day = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay();
      if (day === 0) continue;
      const ymd = d.toISOString().slice(0, 10);
      for (const hhmm of ["11:00", "16:00"]) {
        const start = new Date(`${ymd}T${hhmm}:00+05:30`);
        if (start <= from || MockCalendar.booked.has(start.toISOString())) continue;
        slots.push({ start: start.toISOString(), end: new Date(start.getTime() + 60 * 60_000).toISOString() });
      }
    }
    return slots;
  }

  async book(req: BookingRequest) {
    if (MockCalendar.failNextBooking) { MockCalendar.failNextBooking = false; throw new Error("mock booking failure"); }
    const start = new Date(req.start).toISOString();
    if (MockCalendar.booked.has(start)) throw new Error("slot no longer available");
    MockCalendar.booked.add(start);
    return { bookingId: `mock-bk-${randomUUID().slice(0, 8)}`, start, end: new Date(Date.parse(start) + 3600_000).toISOString() };
  }

  verifyWebhook(rawBody: string, headers: Headers) { return safeEqual(headers.get("x-mock-signature"), hmacHex(this.secret, rawBody)); }

  parseWebhook(payload: unknown): CalendarWebhookEvent | null {
    const p = payload as { triggerEvent?: string; payload?: { uid?: string; startTime?: string; endTime?: string; metadata?: { lead_id?: string }; attendees?: { email?: string; phoneNumber?: string }[] } };
    if (!p?.payload?.uid) return null;
    const type = p.triggerEvent === "BOOKING_CREATED" ? "booking_created" : p.triggerEvent === "BOOKING_CANCELLED" ? "booking_cancelled" : "other";
    return { type, bookingId: p.payload.uid, start: p.payload.startTime ?? null, end: p.payload.endTime ?? null,
      attendeeEmail: p.payload.attendees?.[0]?.email ?? null, attendeePhone: p.payload.attendees?.[0]?.phoneNumber ?? null,
      leadId: p.payload.metadata?.lead_id ?? null, eventId: `${p.triggerEvent}:${p.payload.uid}` };
  }
}
