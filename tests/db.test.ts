import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/db/memory";

const lead = (phone: string) => ({
  phone, channel: "phone", name: null, email: null, locality: null, facts: {}, verdict: null, urgent: false,
  reason: null, criteria: null, flags: [], uncertainties: [], live_verdict: null, verdict_mismatch: false,
  price_leak: false, booking_status: "none" as const, booked_slot: null, preferred_time_raw: null,
  hubspot_contact_id: null, hubspot_deal_id: null, review_reasons: [], review_resolved_at: null, extraction_failed: false,
});

describe("MemoryRepo", () => {
  it("dedupes webhook events by source + external id", async () => {
    const r = new MemoryRepo();
    const a = await r.saveWebhookEvent({ source: "vaani", event_type: "x", external_id: "e1", payload: {}, signature_valid: true });
    const b = await r.saveWebhookEvent({ source: "vaani", event_type: "x", external_id: "e1", payload: {}, signature_valid: true });
    expect(b.duplicate).toBe(true);
    expect(b.row.id).toBe(a.row.id);
  });

  it("enforces one lead per phone and channel", async () => {
    const r = new MemoryRepo();
    await r.insertLead(lead("+911"));
    await expect(r.insertLead(lead("+911"))).rejects.toThrow();
    expect(await r.findLeadByPhone("+911")).not.toBeNull();
  });

  it("upserts calls by provider id", async () => {
    const r = new MemoryRepo();
    const base = { provider_call_id: "c1", lead_id: null, channel: "phone", caller_phone: null, started_at: null, ended_at: null,
      duration_sec: 0, status: "completed" as const, transcript: null, recording_url: null, live_verdict: null, ring_sec: null,
      voice_cost_usd: 0, llm_cost_usd: 0, llm_input_tokens: 0, llm_output_tokens: 0, extraction_status: "pending" as const,
      webhook_event_id: null, processed_at: null };
    const a = await r.upsertCall(base);
    const b = await r.upsertCall({ ...base, duration_sec: 30 });
    expect(b.id).toBe(a.id);
    expect(b.duration_sec).toBe(30);
  });

  it("retries jobs with backoff, then dead-letters", async () => {
    const r = new MemoryRepo();
    await r.enqueueJob("k", { a: 1 }, { maxAttempts: 2 });
    let [job] = await r.claimDueJobs(5);
    expect(await r.failJob(job, "e1")).toBe("retry");
    expect(await r.claimDueJobs(5)).toHaveLength(0); // backoff not elapsed
    const j = (await r.listJobs("pending"))[0];
    r.jobs.set(j.id, { ...j, run_after: new Date(0).toISOString() });
    [job] = await r.claimDueJobs(5);
    expect(job.attempts).toBe(2);
    expect(await r.failJob(job, "e2")).toBe("dead");
    expect((await r.listDeadLetters())[0].error).toBe("e2");
  });
});
