import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
import { PGlite } from "@electric-sql/pglite";
import { NeonRepo } from "@/lib/db/neon";
import { loadFixtures } from "@/fixtures/load";
import { MockLLM } from "@/lib/adapters/llm/mock";
import { MockCRM } from "@/lib/adapters/crm/mock";
import { MockNotifier } from "@/lib/adapters/notifier/mock";
import { processCall } from "@/lib/pipeline/process-call";
import { drainJobs } from "@/lib/pipeline/jobs";
import { freshServices, webhookPayload } from "./helpers";

/** Runs the real schema (db/schema.sql) and the real NeonRepo SQL against an in-process Postgres. */
let repo: NeonRepo;
beforeAll(async () => {
  const pg = new PGlite();
  await pg.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8"));
  await pg.exec(fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8")); // re-runnable
  repo = new NeonRepo(async (text, params) => (await pg.query(text, params)).rows as Record<string, unknown>[]);
});

const lead = (phone: string) => ({
  phone, channel: "phone", name: "A", email: "a@x.com", locality: "Baner", facts: { bhk: 2, scope_rooms: ["kitchen"] }, verdict: null, urgent: false,
  reason: null, criteria: null, flags: [], uncertainties: [], live_verdict: null, verdict_mismatch: false,
  price_leak: false, booking_status: "none" as const, booked_slot: null, preferred_time_raw: null,
  hubspot_contact_id: null, hubspot_deal_id: null, review_reasons: [], review_resolved_at: null, extraction_failed: false,
});

describe("NeonRepo on real Postgres", () => {
  it("dedupes webhook events", async () => {
    const e = { source: "vaani" as const, event_type: "x", external_id: "n1", payload: { a: 1 }, signature_valid: true };
    const a = await repo.saveWebhookEvent(e);
    const b = await repo.saveWebhookEvent(e);
    expect(a.duplicate).toBe(false);
    expect(b).toMatchObject({ duplicate: true, row: { id: a.row.id } });
    expect((await repo.getWebhookEvent(a.row.id))!.payload).toEqual({ a: 1 });
  });

  it("leads: unique phone, jsonb/array round-trip, filters and search", async () => {
    const l = await repo.insertLead(lead("+911111111111"));
    await expect(repo.insertLead(lead("+911111111111"))).rejects.toThrow();
    expect(l.facts).toEqual({ bhk: 2, scope_rooms: ["kitchen"] });
    expect(typeof l.created_at).toBe("string");
    const u = await repo.updateLead(l.id, { verdict: "qualified", flags: ["priority"], review_reasons: ["unclear"], criteria: { budget: { status: "pass", reason: "r" } } as never });
    expect(u.flags).toEqual(["priority"]);
    expect((await repo.listLeads({ verdict: "qualified", needsReview: true, search: "baner" })).map((x) => x.id)).toContain(l.id);
    expect(await repo.listLeads({ search: "100%_nomatch" })).toEqual([]);
    expect((await repo.findLeadByPhone("+911111111111"))!.id).toBe(l.id);
  });

  it("calls upsert by provider id; numerics come back as numbers", async () => {
    const base = { provider_call_id: "nc1", lead_id: null, channel: "phone", caller_phone: null, started_at: "2026-10-08T10:00:00Z", ended_at: null,
      duration_sec: 10, status: "completed" as const, transcript: null, recording_url: null, live_verdict: null, ring_sec: 2.5,
      voice_cost_usd: 0.12, llm_cost_usd: 0.003, llm_input_tokens: 0, llm_output_tokens: 0, extraction_status: "pending" as const,
      webhook_event_id: null, processed_at: null };
    const a = await repo.upsertCall(base);
    const b = await repo.upsertCall({ ...base, duration_sec: 99 });
    expect(b.id).toBe(a.id);
    expect(b.duration_sec).toBe(99);
    expect(b.ring_sec).toBe(2.5);
    expect(b.voice_cost_usd).toBe(0.12);
    expect((await repo.listCalls({ since: "2026-10-01T00:00:00Z" })).length).toBeGreaterThan(0);
  });

  it("bookings: upsert, unlinked lookup by phone/email, link", async () => {
    const l = await repo.insertLead(lead("+912222222222"));
    const b = await repo.upsertBooking({ lead_id: null, provider: "calcom", provider_booking_id: "bk-1", start_at: "2026-10-13T05:30:00Z", end_at: null, status: "accepted", attendee_email: "P@X.com", attendee_phone: null });
    expect((await repo.findUnlinkedBookings(null, "p@x.com")).map((x) => x.id)).toEqual([b.id]);
    await repo.linkBooking(b.id, l.id);
    expect(await repo.listBookingsForLead(l.id)).toHaveLength(1);
    expect(await repo.findUnlinkedBookings(null, "p@x.com")).toEqual([]);
  });

  it("notifications: unique dedupe key, unacknowledged query", async () => {
    const l = await repo.insertLead(lead("+913333333333"));
    const n = await repo.insertNotification({ lead_id: l.id, kind: "handoff", variant: "booked", dedupe_key: "k1", recipient: "d@x.com", cc: null, subject: "s",
      provider: "resend", provider_id: null, status: "queued", error: null, sent_at: null, delivered_at: null, opened_at: null, acknowledged_at: null,
      reminder_sent_at: null, flagged_unacknowledged_at: null });
    await expect(repo.insertNotification({ ...n, dedupe_key: "k1" } as never)).rejects.toThrow();
    await repo.updateNotification(n.id, { status: "sent", sent_at: "2026-10-01T00:00:00Z", provider_id: "em_1" });
    expect((await repo.listUnacknowledged(new Date().toISOString())).map((x) => x.id)).toContain(n.id);
    expect((await repo.findNotificationByProviderId("em_1"))!.id).toBe(n.id);
    expect(await repo.listNotifications({ leadId: l.id })).toHaveLength(1);
  });

  it("jobs: claim_jobs, backoff, dead letters", async () => {
    await repo.enqueueJob("k", { x: 1 }, { maxAttempts: 1 });
    const [job] = await repo.claimDueJobs(5);
    expect(job).toMatchObject({ status: "running", attempts: 1, payload: { x: 1 } });
    expect(await repo.claimDueJobs(5)).toHaveLength(0);
    expect(await repo.failJob(job, "boom")).toBe("dead");
    expect((await repo.listDeadLetters())[0]).toMatchObject({ kind: "k", error: "boom" });
    expect((await repo.listJobs("failed")).length).toBe(1);
  });

  it("full pipeline on Postgres: T17 redial is one lead, T01 qualifies", async () => {
    const s = freshServices();
    (s as { repo: unknown }).repo = repo;
    const fxs = Object.fromEntries(loadFixtures().map((f) => [f.id, f]));
    for (const id of ["T17", "T01"]) {
      for (const call of fxs[id].calls) {
        MockLLM.register(call.call_id, fxs[id].facts);
        await processCall(s, s.voice.parseWebhook(webhookPayload(fxs[id], call))!, null);
      }
    }
    await drainJobs(s);
    const t17 = (await repo.findLeadByPhone(fxs.T17.caller_phone))!;
    expect(await repo.listCallsForLead(t17.id)).toHaveLength(2);
    expect(t17.verdict).toBe("qualified");
    expect((await repo.findLeadByPhone(fxs.T01.caller_phone))!.hubspot_contact_id).toMatch(/^mock-contact/);
    expect(MockCRM.synced.length).toBe(2);
    expect(MockNotifier.outbox.length).toBe(2);
  });
});

describe("NeonRepo.listBookings", () => {
  it("returns non-cancelled bookings in range, soonest first", async () => {
    const mk = (id: string, start: string, status = "accepted") => repo.upsertBooking({ lead_id: null, provider: "calcom", provider_booking_id: id, start_at: start, end_at: null, status, attendee_email: null, attendee_phone: null });
    await mk("cal-b", "2027-01-12T05:30:00Z");
    await mk("cal-a", "2027-01-05T05:30:00Z");
    await mk("cal-x", "2027-01-08T05:30:00Z", "cancelled");
    await mk("cal-out", "2027-02-02T05:30:00Z");
    const r = await repo.listBookings("2027-01-01T00:00:00Z", "2027-02-01T00:00:00Z");
    expect(r.map((b) => b.provider_booking_id)).toEqual(["cal-a", "cal-b"]);
  });
});
