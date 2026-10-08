import { beforeEach, describe, expect, it, vi } from "vitest";
const pendingAfter: Promise<unknown>[] = [];
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { pendingAfter.push(Promise.resolve().then(fn)); } }));
const settle = async () => { while (pendingAfter.length) await pendingAfter.shift(); };

import { loadFixtures } from "@/fixtures/load";
import { MockLLM } from "@/lib/adapters/llm/mock";
import { MockNotifier } from "@/lib/adapters/notifier/mock";
import { MockCRM } from "@/lib/adapters/crm/mock";
import { MockCalendar } from "@/lib/adapters/calendar/mock";
import { processCall } from "@/lib/pipeline/process-call";
import { drainJobs, runMaintenance } from "@/lib/pipeline/jobs";
import { findPriceLeaks } from "@/lib/guard/price-guard";
import { makeAckToken } from "@/lib/handoff/ack-token";
import { freshServices, SECRET, webhookPayload } from "./helpers";
import { POST as vaaniWebhook } from "@/app/api/vaani/webhook/route";
import { POST as evaluateTool } from "@/app/api/tools/evaluate/route";
import { POST as bookSlot } from "@/app/api/tools/book-slot/route";
import { POST as calcomWebhook } from "@/app/api/calcom/webhook/route";
import { GET as ack } from "@/app/api/ack/route";
import { GET as retry } from "@/app/api/jobs/retry/route";
import { hmacHex } from "@/lib/security/hmac";

const fixtures = Object.fromEntries(loadFixtures().map((f) => [f.id, f]));

async function runFixture(s: ReturnType<typeof freshServices>, id: string) {
  const fx = fixtures[id];
  for (const call of fx.calls) {
    if (fx.facts) MockLLM.register(call.call_id, fx.facts);
    const n = s.voice.parseWebhook(webhookPayload(fx, call))!;
    await processCall(s, n, null);
  }
  await drainJobs(s);
  return (await s.repo.findLeadByPhone(fx.caller_phone))!;
}

const signed = (url: string, body: unknown, header = "x-mock-signature") => {
  const raw = JSON.stringify(body);
  return new Request(url, { method: "POST", body: raw, headers: { [header]: hmacHex(SECRET, raw), "content-type": "application/json" } });
};
const tool = (url: string, body: unknown) =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "x-tool-secret": SECRET } });

describe("full pipeline replay T01–T20 (mock adapters)", () => {
  let s: ReturnType<typeof freshServices>;
  beforeEach(() => { s = freshServices(); });

  for (const fx of loadFixtures()) {
    it(`${fx.id} → ${fx.expected}`, async () => {
      const lead = await runFixture(s, fx.id);
      if (fx.expected === "missed") {
        expect(lead.verdict).toBeNull();
        expect(lead.review_reasons).toContain("missed_call");
        expect(MockNotifier.outbox).toHaveLength(0);
        return;
      }
      expect(lead.verdict).toBe(fx.expected);
      const sync = MockCRM.synced.find((x) => x.leadId === lead.id)!;
      expect(sync.stage).toBe(fx.expected === "declined" ? "closedlost" : "appointmentscheduled");
      // No booking happened in a replay, so qualified leads need a manual booking and get an urgent email.
      if (fx.expected === "qualified") {
        expect(lead.booking_status).toBe("needs_manual_booking");
        expect(MockNotifier.outbox[0].subject).toMatch(/^URGENT · Needs manual booking/);
      }
      if (fx.expected === "declined") { expect(MockNotifier.outbox).toHaveLength(0); expect(lead.review_reasons).toContain("declined"); }
      for (const e of MockNotifier.outbox) for (const part of [e.subject, e.html, e.text]) expect(findPriceLeaks(part)).toEqual([]);
    });
  }

  it("T09 sends an urgent escalation email; T10 a non-urgent budget review", async () => {
    await runFixture(s, "T09");
    expect(MockNotifier.outbox[0].subject).toMatch(/^URGENT · Escalation \(Existing client complaint\)/);
    MockNotifier.outbox = [];
    await runFixture(s, "T10");
    expect(MockNotifier.outbox[0].subject).toMatch(/^Review needed: .*\(budget check\)$/);
  });

  it("T17: a dropped call and the redial are one lead", async () => {
    const lead = await runFixture(s, "T17");
    const calls = await s.repo.listCallsForLead(lead.id);
    expect(calls).toHaveLength(2);
    expect(s.repo.leads.size).toBe(1);
    expect(lead.verdict).toBe("qualified");
    expect(lead.review_reasons).not.toContain("missed_call");
    expect(calls.map((c) => c.extraction_status).sort()).toEqual(["ok", "skipped"]);
  });

  it("processing the same call twice is a no-op", async () => {
    await runFixture(s, "T01");
    const fx = fixtures.T01;
    const again = await processCall(s, s.voice.parseWebhook(webhookPayload(fx, fx.calls[0]))!, null);
    expect(again.status).toBe("duplicate");
  });

  it("flags a price leak by the agent in the transcript", async () => {
    const fx = structuredClone(fixtures.T02);
    fx.calls[0].turns.push({ speaker: "agent", text: "Roughly 1,800 per sq ft for standard." });
    MockLLM.register(fx.calls[0].call_id, fx.facts);
    await processCall(s, s.voice.parseWebhook(webhookPayload(fx, fx.calls[0]))!, null);
    const lead = (await s.repo.findLeadByPhone(fx.caller_phone))!;
    expect(lead.price_leak).toBe(true);
    expect(lead.review_reasons).toContain("price_leak");
  });

  it("extraction that fails twice is flagged for review, nothing sent", async () => {
    const fx = fixtures.T01;
    MockLLM.register(fx.calls[0].call_id, { not: "valid" });
    await processCall(s, s.voice.parseWebhook(webhookPayload(fx, fx.calls[0]))!, null);
    await drainJobs(s);
    const lead = (await s.repo.findLeadByPhone(fx.caller_phone))!;
    expect(lead.extraction_failed).toBe(true);
    expect(lead.review_reasons).toContain("extraction_failed");
    expect(MockNotifier.outbox).toHaveLength(0);
  });

  it("verdict mismatch between live and post-call goes to review", async () => {
    const fx = fixtures.T03;
    await evaluateTool(tool("http://x/api/tools/evaluate", { call_id: fx.calls[0].call_id, caller_phone: fx.caller_phone, args: { facts: { locality: "Baner", scope_type: "full_home", completion_by: "2027-03-01" } } }));
    const lead = await runFixture(s, "T03");
    expect(lead.live_verdict).toBe("qualified");
    expect(lead.verdict).toBe("declined");
    expect(lead.review_reasons).toContain("verdict_mismatch");
  });
});

describe("booking → handoff", () => {
  let s: ReturnType<typeof freshServices>;
  beforeEach(() => { s = freshServices(); });

  it("book-slot mid-call, then end-of-call → one handoff email with ack link", async () => {
    const fx = fixtures.T01;
    const slots = await s.calendar.getAvailability(new Date(Date.parse(fx.calls[0].started_at) + 864e5).toISOString(), new Date(Date.parse(fx.calls[0].started_at) + 7 * 864e5).toISOString(), "Asia/Kolkata");
    const res = await bookSlot(tool("http://x/api/tools/book-slot", { call_id: fx.calls[0].call_id, caller_phone: fx.caller_phone, args: { slot_start: slots[0].start, name: "Priya", email: "priya@example.com", locality: "Kothrud" } }));
    expect((await res.json()).ok).toBe(true);
    const lead = await runFixture(s, "T01");
    expect(lead.booking_status).toBe("booked");
    expect(MockNotifier.outbox).toHaveLength(1);
    const e = MockNotifier.outbox[0];
    expect(e.subject).toBe("New consultation booked: Priya, Kothrud, Dahanukar Colony, 3BHK apartment");
    expect(e.to).toBe("designer@example.com");
    expect(e.cc).toBe("desk@example.com");
    expect(e.text).toMatch(/Acknowledge .*\/api\/ack\?token=/);

    // Cal.com BOOKING_CREATED arriving afterwards must not send a second email.
    const booking = (await s.repo.listBookingsForLead(lead.id))[0];
    await calcomWebhook(signed("http://x/api/calcom/webhook", { triggerEvent: "BOOKING_CREATED", payload: { uid: booking.provider_booking_id, startTime: booking.start_at, metadata: { lead_id: lead.id } } }));
    await drainJobs(s);
    expect(MockNotifier.outbox).toHaveLength(1);
  });

  it("Cal.com webhook before the end-of-call webhook: handoff waits for the verdict", async () => {
    const fx = fixtures.T20;
    const res = await bookSlot(tool("http://x", { caller_phone: fx.caller_phone, args: { slot_start: "2026-10-01T11:00:00+05:30", name: "Pooja" } }));
    expect((await res.json()).ok).toBe(true);
    await drainJobs(s);
    expect(MockNotifier.outbox).toHaveLength(0); // no verdict yet
    const lead = await runFixture(s, "T20");
    expect(lead.verdict).toBe("qualified");
    expect(MockNotifier.outbox.map((e) => e.subject)).toEqual(["New consultation booked: Pooja, Magarpatta, Cybercity, 2BHK apartment"]);
  });

  it("priority project gets the urgent variant", async () => {
    const fx = fixtures.T12;
    await bookSlot(tool("http://x", { caller_phone: fx.caller_phone, args: { slot_start: "2026-09-17T11:00:00+05:30", name: "Anand Sharma" } }));
    await runFixture(s, "T12");
    expect(MockNotifier.outbox[0].subject).toMatch(/^URGENT · Priority consultation booked: Anand Sharma/);
  });

  it("booking failure → needs manual booking with the preferred time", async () => {
    MockCalendar.failNextBooking = true;
    const fx = fixtures.T15;
    const res = await bookSlot(tool("http://x", { caller_phone: fx.caller_phone, args: { slot_start: "2026-09-22T16:00:00+05:30", name: "Smita" } }));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(findPriceLeaks(body.say)).toEqual([]);
    const lead = await runFixture(s, "T15");
    expect(lead.booking_status).toBe("needs_manual_booking");
    expect(lead.review_reasons).toContain("needs_manual_booking");
    expect(MockNotifier.outbox[0].subject).toMatch(/^URGENT · Needs manual booking: Smita/);
    expect(MockNotifier.outbox[0].text).toMatch(/Preferred time: Tue, 22 Sept 2026, 4:00 pm IST|Preferred time: .*2026/);
  });
});

describe("acknowledgement, reminders, retries", () => {
  let s: ReturnType<typeof freshServices>;
  beforeEach(() => { s = freshServices(); });

  it("ack link stores acknowledged_at; tampered token rejected", async () => {
    await runFixture(s, "T09");
    const n = (await s.repo.listNotifications())[0];
    const ok = await ack(new Request(`http://x/api/ack?token=${encodeURIComponent(makeAckToken(n.id))}`));
    expect(ok.status).toBe(200);
    expect((await s.repo.getNotification(n.id))!.acknowledged_at).not.toBeNull();
    const bad = await ack(new Request(`http://x/api/ack?token=${encodeURIComponent(makeAckToken(n.id))}x`));
    expect(bad.status).toBe(400);
  });

  it("expired token rejected", async () => {
    const t = makeAckToken("abc", Date.now() - 30 * 864e5);
    expect((await ack(new Request(`http://x/api/ack?token=${encodeURIComponent(t)}`))).status).toBe(400);
  });

  it("sends one reminder, then flags the lead on the dashboard", async () => {
    await runFixture(s, "T09");
    const n = (await s.repo.listNotifications())[0];
    await s.repo.updateNotification(n.id, { sent_at: new Date(Date.now() - 25 * 3600_000).toISOString() });
    await runMaintenance(s);
    await runMaintenance(s);
    const reminders = MockNotifier.outbox.filter((e) => e.subject.startsWith("Reminder"));
    expect(reminders).toHaveLength(1);
    const lead = (await s.repo.getLead(n.lead_id!))!;
    expect(lead.review_reasons).toContain("unacknowledged_handoff");
    // The reminder's ack link acknowledges the original email.
    const token = decodeURIComponent(reminders[0].text.match(/token=([^\s]+)/)![1]);
    await ack(new Request(`http://x/api/ack?token=${encodeURIComponent(token)}`));
    expect((await s.repo.getNotification(n.id))!.acknowledged_at).not.toBeNull();
    expect((await s.repo.getLead(n.lead_id!))!.review_reasons).not.toContain("unacknowledged_handoff");
  });

  it("failed CRM sync is retried by the cron and succeeds", async () => {
    MockCRM.failNext = true;
    const lead = await runFixture(s, "T01");
    expect(lead.hubspot_contact_id).toBeNull();
    const job = (await s.repo.listJobs("pending")).find((j) => j.kind === "crm_sync")!;
    s.repo.jobs.set(job.id, { ...job, run_after: new Date(0).toISOString() });
    await runMaintenance(s);
    expect((await s.repo.getLead(lead.id))!.hubspot_contact_id).toMatch(/^mock-contact/);
  });

  it("retry endpoint requires the cron secret when set", async () => {
    process.env.CRON_SECRET = "cron";
    expect((await retry(new Request("http://x/api/jobs/retry"))).status).toBe(401);
    expect((await retry(new Request("http://x/api/jobs/retry", { headers: { authorization: "Bearer cron" } }))).status).toBe(200);
    delete process.env.CRON_SECRET;
  });
});

describe("webhook route", () => {
  let s: ReturnType<typeof freshServices>;
  beforeEach(() => { s = freshServices(); });

  it("rejects a bad signature and stores nothing", async () => {
    const res = await vaaniWebhook(new Request("http://x", { method: "POST", body: "{}", headers: { "x-mock-signature": "nope" } }));
    expect(res.status).toBe(401);
    expect(s.repo.events.size).toBe(0);
  });

  it("stores the raw payload, returns fast, processes in the background, dedupes redelivery", async () => {
    const fx = fixtures.T06;
    MockLLM.register(fx.calls[0].call_id, fx.facts);
    const body = webhookPayload(fx, fx.calls[0]);
    const res = await vaaniWebhook(signed("http://x", body));
    expect(res.status).toBe(200);
    expect((await res.json()).queued).toBe(true);
    await settle();
    expect(s.repo.events.size).toBe(1);
    expect((await s.repo.findLeadByPhone(fx.caller_phone))!.verdict).toBe("qualified");
    const again = await vaaniWebhook(signed("http://x", body));
    expect((await again.json()).duplicate).toBe(true);
  });

  it("tool endpoints reject requests without the tool secret", async () => {
    const res = await evaluateTool(new Request("http://x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("evaluate tool asks one question, then books", async () => {
    const r1 = await (await evaluateTool(tool("http://x", { args: { facts: { scope_type: "full_home", completion_by: "2027-03-01" } } }))).json();
    expect(r1.next_action).toBe("ask");
    const r2 = await (await evaluateTool(tool("http://x", { args: { facts: { scope_type: "full_home", completion_by: "2027-03-01", locality: "Wakad" }, asked: ["service_area"] } }))).json();
    expect(r2.next_action).toBe("book");
  });
});

describe("Vaani format end to end", () => {
  it("call_started stores the number; call_postprocessing is processed against it; test numbers skip CRM and email", async () => {
    const { VaaniVoice } = await import("@/lib/adapters/voice/vaani");
    const s = freshServices();
    const vaani = new VaaniVoice(undefined, SECRET);
    s.voice = vaani as unknown as typeof s.voice;
    const send = (body: unknown) => {
      const raw = JSON.stringify(body), ts = String(Math.floor(Date.now() / 1000));
      return vaaniWebhook(new Request("http://x/api/vaani/webhook", { method: "POST", body: raw,
        headers: { "x-vaani-timestamp": ts, "x-vaani-signature": `sha256=${hmacHex(SECRET, `${ts}.${raw}`)}` } }));
    };
    const fx = fixtures.T20;
    const id = "inbound-77";
    MockLLM.register(id, fx.facts);
    expect((await send({ event: "call_started", room_name: id, status: "active", phone_number: fx.caller_phone })).status).toBe(200);
    const transcript = fx.calls[0].turns.map((t) => `[09:15:00] ${t.speaker === "agent" ? "AGENT" : "USER"}: ${t.text}`).join("\n\n");
    const res = await send({ event: "call_postprocessing", call_id: id, timestamp: "2026-09-25T03:50:00+00:00",
      data: { call_id: id, room_name: id, call_duration: 284000, end_reason: "Call ended", transcript, dispositions: { qualification: "qualified" }, recording_url: "https://r/1" } });
    expect((await res.json()).queued).toBe(true);
    await settle();
    const lead = (await s.repo.findLeadByPhone(fx.caller_phone))!;
    expect(lead.verdict).toBe("qualified");
    expect(lead.live_verdict).toBe("qualified");
    expect(lead.verdict_mismatch).toBe(false);
    expect(MockCRM.synced).toHaveLength(1);

    // Same flow from a +910000 test number: processed, but nothing leaves the system.
    MockCRM.synced = []; MockNotifier.outbox = [];
    MockLLM.register("inbound-78", fx.facts);
    await send({ event: "call_started", room_name: "inbound-78", phone_number: "+910000123456" });
    await send({ event: "call_postprocessing", call_id: "inbound-78", timestamp: "2026-09-25T03:50:00+00:00", data: { call_id: "inbound-78", call_duration: 1000, transcript } });
    await settle();
    expect((await s.repo.findLeadByPhone("+910000123456"))!.verdict).toBe("qualified");
    expect(MockCRM.synced).toHaveLength(0);
    expect(MockNotifier.outbox).toHaveLength(0);
  });
});

describe("online call (no caller ID)", () => {
  it("uses the number the caller spoke, and links the Cal.com booking made by Vaani", async () => {
    const s = freshServices();
    const fx = fixtures.T01;
    // Vaani's Cal.com integration books first, with the spoken number.
    await calcomWebhook(signed("http://x", { triggerEvent: "BOOKING_CREATED", payload: { uid: "web-bk", startTime: "2026-09-05T05:30:00Z", responses: { attendeePhoneNumber: { value: "+919811112222" } } } }));
    MockLLM.register("web-1", { ...fx.facts, phone: "98111 12222" });
    const call = s.voice.parseWebhook({ event_id: "e-web-1", event: "call.ended", call: { providerCallId: "web-1", callerPhone: null, startedAt: fx.calls[0].started_at, durationSec: 200, status: "completed", turns: fx.calls[0].turns } })!;
    await processCall(s, call, null);
    await drainJobs(s);
    const lead = (await s.repo.findLeadByPhone("+919811112222"))!;
    expect(lead).toBeTruthy();
    expect(lead.booking_status).toBe("booked");
    expect(MockNotifier.outbox[0].subject).toMatch(/^New consultation booked: Priya/);
    expect(MockNotifier.outbox[0].text).toContain("Phone: +919811112222");
  });
});

describe("smoke-test numbers", () => {
  it("+910001 numbers send a [TEST] email but never reach HubSpot; +910000 send nothing", async () => {
    const s = freshServices();
    const fx = fixtures.T01;
    for (const [phone, id] of [["+910001123456", "em-1"], ["+910000123456", "si-1"]] as const) {
      MockLLM.register(id, fx.facts);
      await processCall(s, s.voice.parseWebhook({ event_id: `e-${id}`, event: "call.ended", call: { providerCallId: id, callerPhone: phone, startedAt: fx.calls[0].started_at, durationSec: 200, status: "completed", turns: fx.calls[0].turns } })!, null);
    }
    await drainJobs(s);
    expect(MockNotifier.outbox.map((e) => e.subject)).toEqual(["[TEST] URGENT · Needs manual booking: Priya, Kothrud, Dahanukar Colony, 3BHK apartment"]);
    expect(MockCRM.synced).toHaveLength(0);
  });
});
