import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { normaliseTranscript, VaaniVoice } from "@/lib/adapters/voice/vaani";
import { CalcomCalendar } from "@/lib/adapters/calendar/calcom";
import { ResendNotifier } from "@/lib/adapters/notifier/resend";
import { HubSpotCRM } from "@/lib/adapters/crm/hubspot";
import { normalisePhone, isTestNumber } from "@/lib/phone";
import { emptyFacts } from "@/lib/domain/lead";
import type { LeadRow } from "@/lib/db/types";

afterEach(() => vi.unstubAllGlobals());

const POSTPROCESSING = {
  event: "call_postprocessing", call_id: "inbound-1-abc", timestamp: "2026-10-08T10:05:00+00:00",
  data: {
    room_name: "inbound-1-abc", call_id: "inbound-1-abc", call_duration: 245000, end_reason: "Call ended",
    summary: "s", entities: { name: "Priya" }, dispositions: { qualification: "Qualified" },
    recording_url: "https://api.vaanivoice.ai/api/stream/inbound-1-abc",
    transcript: "[10:01:00] AGENT: Hi, I'm the studio's AI assistant.\n\n[10:01:05] USER: Hi, I have a 3BHK in Kothrud.\n\n[10:01:09] AGENT: Lovely.",
  },
};

describe("Vaani adapter", () => {
  const v = new VaaniVoice(undefined, "vsecret");
  const sign = (body: string, ts = Math.floor(Date.now() / 1000)) =>
    new Headers({ "x-vaani-timestamp": String(ts), "x-vaani-signature": `sha256=${createHmac("sha256", "vsecret").update(`${ts}.${body}`).digest("hex")}` });

  it("verifies the documented signature", () => {
    const body = JSON.stringify(POSTPROCESSING);
    expect(v.verifyWebhook(body, sign(body))).toBe(true);
    expect(v.verifyWebhook(body + " ", sign(body))).toBe(false);
  });
  it("rejects stale timestamps (replay)", () => {
    const body = "{}";
    expect(v.verifyWebhook(body, sign(body, Math.floor(Date.now() / 1000) - 600))).toBe(false);
  });
  it("accepts the URL token fallback only with the right token", () => {
    expect(v.verifyWebhook("{}", new Headers(), "https://x/api/vaani/webhook?token=vsecret")).toBe(true);
    expect(v.verifyWebhook("{}", new Headers(), "https://x/api/vaani/webhook?token=nope")).toBe(false);
    expect(v.verifyWebhook("{}", new Headers(), "https://x/api/vaani/webhook")).toBe(false);
  });
  it("parses call_postprocessing", () => {
    const c = v.parseWebhook(POSTPROCESSING)!;
    expect(c.providerCallId).toBe("inbound-1-abc");
    expect(c.durationSec).toBe(245);
    expect(c.transcript).toBe("Agent: Hi, I'm the studio's AI assistant.\nCaller: Hi, I have a 3BHK in Kothrud.\nAgent: Lovely.");
    expect(c.liveVerdict).toBe("qualified");
    expect(c.status).toBe("completed");
    expect(c.startedAt).toBe("2026-10-08T10:00:55.000Z");
  });
  it("ignores other events but remembers call_started numbers", () => {
    expect(v.parseWebhook({ event: "call_ended", room_name: "r", call_duration: 4 })).toBeNull();
    expect(v.parseCallStart({ event: "call_started", room_name: "r1", phone_number: "+919800000001" })).toEqual({ providerCallId: "r1", callerPhone: "+919800000001" });
  });
  it("a call with no caller speech is missed", () =>
    expect(v.parseWebhook({ ...POSTPROCESSING, data: { ...POSTPROCESSING.data, transcript: "[1:00:00] AGENT: Hello?" } })!.status).toBe("missed"));
  it("enriches caller number from call history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ call_id: "inbound-1-abc", direction: "Incoming", from_number: "+919800000002", to_number: "+912000000000", Start_time: "2026-10-08T10:00:50.1" }], pagination: { has_next: false } }))));
    const c = await new VaaniVoice("key", "s").enrich(v.parseWebhook(POSTPROCESSING)!);
    expect(c.callerPhone).toBe("+919800000002");
    expect(c.startedAt).toBe("2026-10-08T10:00:50.100Z");
  });
  it("normalises transcript speaker labels", () => expect(normaliseTranscript("CUSTOMER: a\n\nAGENT: b")).toBe("Caller: a\nAgent: b"));
});

describe("Cal.com adapter", () => {
  const cal = new CalcomCalendar("cal_key", "123", "csecret");
  it("verifies x-cal-signature-256", () => {
    const body = '{"triggerEvent":"BOOKING_CREATED"}';
    const h = new Headers({ "x-cal-signature-256": createHmac("sha256", "csecret").update(body).digest("hex") });
    expect(cal.verifyWebhook(body, h)).toBe(true);
    expect(cal.verifyWebhook(body, new Headers({ "x-cal-signature-256": "00" }))).toBe(false);
  });
  it("parses BOOKING_CREATED", () => {
    const e = cal.parseWebhook({ triggerEvent: "BOOKING_CREATED", payload: { uid: "bk1", startTime: "2026-10-13T05:30:00Z", attendees: [{ email: "p@x.com" }], responses: { attendeePhoneNumber: { value: "+919800000001" } }, metadata: { lead_id: "L1" } } })!;
    expect(e).toMatchObject({ type: "booking_created", bookingId: "bk1", attendeePhone: "+919800000001", leadId: "L1", attendeeEmail: "p@x.com" });
  });
  it("calls slots and bookings with the documented versions", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/slots")
      ? { status: "success", data: { "2026-10-13": [{ start: "2026-10-13T11:00:00.000+05:30", end: "2026-10-13T12:00:00.000+05:30" }] } }
      : { status: "success", data: { uid: "bk9", start: "2026-10-13T05:30:00.000Z", end: "2026-10-13T06:30:00.000Z" } })));
    vi.stubGlobal("fetch", fetchMock);
    const slots = await cal.getAvailability("2026-10-12T00:00:00Z", "2026-10-14T00:00:00Z", "Asia/Kolkata");
    expect(slots[0].start).toBe("2026-10-13T05:30:00.000Z");
    const b = await cal.book({ start: slots[0].start, name: "Priya", phone: "+919800000001", email: null, locality: "Kothrud", notes: null, leadId: "L1", timeZone: "Asia/Kolkata" });
    expect(b.bookingId).toBe("bk9");
    const [slotsCall, bookCall] = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect((slotsCall[1].headers as Record<string, string>)["cal-api-version"]).toBe("2024-09-04");
    expect((bookCall[1].headers as Record<string, string>)["cal-api-version"]).toBe("2026-02-25");
    const sent = JSON.parse(String(bookCall[1].body));
    expect(sent).toMatchObject({ eventTypeId: 123, attendee: { name: "Priya", timeZone: "Asia/Kolkata", phoneNumber: "+919800000001" }, metadata: { lead_id: "L1" } });
    expect(sent.attendee.email).toBeUndefined();
  });
});

describe("Resend adapter", () => {
  const secretBytes = Buffer.from("resend-test-secret");
  const r = new ResendNotifier("re_key", "Aangan <a@studio.in>", `whsec_${secretBytes.toString("base64")}`);
  it("verifies Svix signatures", () => {
    const body = '{"type":"email.delivered","data":{"email_id":"e1"}}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", secretBytes).update(`msg_1.${ts}.${body}`).digest("base64");
    expect(r.verifyWebhook(body, new Headers({ "svix-id": "msg_1", "svix-timestamp": ts, "svix-signature": `v1,bogus v1,${sig}` }))).toBe(true);
    expect(r.verifyWebhook(body, new Headers({ "svix-id": "msg_2", "svix-timestamp": ts, "svix-signature": `v1,${sig}` }))).toBe(false);
  });
  it("sends with an idempotency key and plain-text body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" })));
    vi.stubGlobal("fetch", fetchMock);
    const { providerId } = await r.send({ to: "d@x.com", cc: "f@x.com", subject: "s", html: "<p>h</p>", text: "t", idempotencyKey: "k1", tags: { kind: "handoff" } });
    expect(providerId).toBe("em_1");
    const [, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ["d@x.com"], cc: ["f@x.com"], text: "t" });
  });
  it("explains a 403 from the shared sender", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    await expect(r.send({ to: "d@x.com", subject: "s", html: "h", text: "t", idempotencyKey: "k" })).rejects.toThrow(/verify your sending domain/);
  });
});

describe("HubSpot adapter", () => {
  const lead = (over: Partial<LeadRow>): LeadRow => ({
    id: "L1", phone: "+919800000001", channel: "phone", name: "Priya Shah", email: null, locality: "Kothrud",
    facts: emptyFacts({ bhk: 3, property_type: "apartment", summary: "3BHK in Kothrud" }), verdict: "qualified", urgent: false,
    reason: "ok", criteria: null, flags: [], uncertainties: [], live_verdict: null, verdict_mismatch: false, price_leak: false,
    booking_status: "booked", booked_slot: null, preferred_time_raw: null, hubspot_contact_id: null, hubspot_deal_id: null,
    review_reasons: [], review_resolved_at: null, extraction_failed: false, first_seen_at: "", last_call_at: "", created_at: "", updated_at: "", ...over,
  });
  function mockHubspot() {
    const calls: { method: string; url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: String(init.method), url, body: init.body ? JSON.parse(String(init.body)) : {} });
      if (url.endsWith("/search")) return new Response(JSON.stringify({ results: [] }));
      if (url.endsWith("/contacts")) return new Response(JSON.stringify({ id: "C1" }));
      return new Response(JSON.stringify({ id: "D1" }));
    }));
    return calls;
  }
  it("qualified → contact + open deal associated to the contact", async () => {
    const calls = mockHubspot();
    const r = await new HubSpotCRM("tok", "999").syncLead(lead({}), "https://app/calls/L1");
    expect(r).toEqual({ contactId: "C1", dealId: "D1" });
    expect(calls[0].body).toMatchObject({ filterGroups: [{ filters: [{ propertyName: "hs_searchable_calculated_phone_number", value: "9800000001" }] }] });
    const deal = calls.find((c) => c.url.endsWith("/deals"))!.body as { properties: Record<string, string>; associations: unknown[] };
    expect(deal.properties.dealstage).toBe("appointmentscheduled");
    expect(deal.associations).toEqual([{ to: { id: "C1" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }]);
  });
  it("declined → closed-lost with reason", async () => {
    const calls = mockHubspot();
    await new HubSpotCRM("tok", undefined).syncLead(lead({ verdict: "declined", reason: "service_area: Nashik is outside" }), "u");
    const deal = calls.find((c) => c.url.endsWith("/deals"))!.body as { properties: Record<string, string> };
    expect(deal.properties).toMatchObject({ dealstage: "closedlost", closed_lost_reason: "service_area: Nashik is outside" });
  });
  it("escalation → contact only", async () => {
    const calls = mockHubspot();
    const r = await new HubSpotCRM("tok", undefined).syncLead(lead({ verdict: "escalate" }), "u");
    expect(r.dealId).toBeNull();
    expect(calls.some((c) => c.url.endsWith("/deals"))).toBe(false);
  });
});

describe("phone helpers", () => {
  it.each([["98000 00001", "+919800000001"], ["09800000001", "+919800000001"], ["919800000001", "+919800000001"], ["+91 98000-00001", "+919800000001"]])("%s → %s", (a, b) => expect(normalisePhone(a)).toBe(b));
  it("recognises smoke-test numbers", () => { expect(isTestNumber("+910000012345")).toBe(true); expect(isTestNumber("+919800000001")).toBe(false); });
});

describe("Vaani real payload (captured from Vaani's webhook test, 2026-10-08)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sample = JSON.parse(require("node:fs").readFileSync("fixtures/vaani/webhook-test-2026-10-08.json", "utf8")) as { events: { event: string }[] };
  const ev = (name: string) => sample.events.find((e) => e.event === name)!;
  const v = new VaaniVoice(undefined, "s");

  it("reads the caller number from nested call_started data", () =>
    expect(v.parseCallStart(ev("call_started"))).toEqual({ providerCallId: "test_room_123", callerPhone: "+919876543210" }));
  it("still reads the documented flat shape", () =>
    expect(v.parseCallStart({ event: "call_started", room_name: "r", phone_number: "+91" })).toEqual({ providerCallId: "r", callerPhone: "+91" }));
  it("parses the real call_postprocessing shape", () => {
    const c = v.parseWebhook(ev("call_postprocessing"))!;
    expect(c).toMatchObject({ providerCallId: "test_room_123", durationSec: 120, transcript: "Agent: Hello\nCaller: Hi", recordingUrl: "https://example.com/recording.mp3" });
  });
  it("treats millisecond durations as milliseconds", () =>
    expect(v.parseWebhook({ event: "call_postprocessing", call_id: "x", data: { call_id: "x", call_duration: 245000, transcript: "USER: hi there" } })!.durationSec).toBe(245));
  it("ignores the test envelope itself", () => {
    expect(v.parseWebhook(sample)).toBeNull();
    expect(v.parseCallStart(sample)).toBeNull();
  });
});

describe("online (browser) calls without a phone number", () => {
  it("HubSpot creates a contact without phone and skips the phone search", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify({ id: url.endsWith("/contacts") ? "C9" : "D9" }));
    }));
    const lead = {
      id: "L9", phone: "online:web-123", channel: "phone", name: "Test", email: null, locality: "Baner",
      facts: emptyFacts({ summary: "s" }), verdict: "qualified", urgent: false, reason: "ok", criteria: null, flags: [], uncertainties: [],
      live_verdict: null, verdict_mismatch: false, price_leak: false, booking_status: "booked", booked_slot: null, preferred_time_raw: null,
      hubspot_contact_id: null, hubspot_deal_id: null, review_reasons: [], review_resolved_at: null, extraction_failed: false,
      first_seen_at: "", last_call_at: "", created_at: "", updated_at: "",
    } as LeadRow;
    await new HubSpotCRM("t", undefined).syncLead(lead, "u");
    expect(calls.some((c) => c.url.endsWith("/search"))).toBe(false);
    expect((calls.find((c) => c.url.endsWith("/contacts"))!.body as { properties: Record<string, string> }).properties.phone).toBeUndefined();
  });
});
