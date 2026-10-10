export interface Slot { start: string; end: string }

export interface BookingRequest {
  start: string;
  name: string;
  phone: string;
  email: string | null;
  locality: string | null;
  notes: string | null;
  leadId: string | null;
  timeZone: string;
}

export interface BookingResult { bookingId: string; start: string; end: string | null }

export interface CalendarWebhookEvent {
  type: "booking_created" | "booking_cancelled" | "booking_rescheduled" | "other";
  bookingId: string;
  start: string | null;
  end: string | null;
  attendeeEmail: string | null;
  attendeePhone: string | null;
  attendeeName: string | null;
  leadId: string | null;
  eventId: string;
}

export interface CalendarProvider {
  readonly name: string;
  getAvailability(fromIso: string, toIso: string, timeZone: string): Promise<Slot[]>;
  book(req: BookingRequest): Promise<BookingResult>;
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  parseWebhook(payload: unknown): CalendarWebhookEvent | null;
}
