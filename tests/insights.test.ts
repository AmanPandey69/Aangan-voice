import { describe, expect, it } from "vitest";
import { fitScore, glance, isAfterHours, needsFollowUp } from "@/lib/insights";
import type { CallRow, LeadRow } from "@/lib/db/types";

const crit = (s: ("pass" | "fail" | "unclear")[]) =>
  Object.fromEntries(["real_project", "service_area", "timeline", "budget", "decision_maker"].map((k, i) => [k, { status: s[i], reason: "" }])) as LeadRow["criteria"];

const lead = (o: Partial<LeadRow>): LeadRow => ({
  id: Math.random().toString(36), phone: "", channel: "phone", name: null, email: null, locality: null, facts: {}, verdict: null, urgent: false,
  reason: null, criteria: null, flags: [], uncertainties: [], live_verdict: null, verdict_mismatch: false, price_leak: false, booking_status: "none",
  booked_slot: null, preferred_time_raw: null, hubspot_contact_id: null, hubspot_deal_id: null, review_reasons: [], review_resolved_at: null,
  extraction_failed: false, first_seen_at: "2026-10-10T10:00:00Z", last_call_at: "2026-10-10T10:00:00Z", created_at: "", updated_at: "", ...o,
});
const call = (started_at: string, status: CallRow["status"] = "completed") => ({ started_at, created_at: started_at, status }) as CallRow;

describe("insights", () => {
  it("scores fit from the five criteria (pass full, unclear half)", () => {
    expect(fitScore(null)).toBeNull();
    expect(fitScore(crit(["pass", "pass", "pass", "pass", "pass"]))).toBe(100);
    expect(fitScore(crit(["pass", "pass", "unclear", "pass", "fail"]))).toBe(70);
  });

  it("flags good leads without a booking for follow-up", () => {
    expect(needsFollowUp({ verdict: "qualified", booking_status: "needs_manual_booking" })).toBe(true);
    expect(needsFollowUp({ verdict: "escalate", booking_status: "none" })).toBe(true);
    expect(needsFollowUp({ verdict: "qualified", booking_status: "booked" })).toBe(false);
    expect(needsFollowUp({ verdict: "declined", booking_status: "none" })).toBe(false);
  });

  it("knows studio hours in IST", () => {
    expect(isAfterHours("2026-10-12T06:00:00Z")).toBe(false); // Mon 11:30 IST
    expect(isAfterHours("2026-10-12T15:00:00Z")).toBe(true);  // Mon 20:30 IST
    expect(isAfterHours("2026-10-11T06:00:00Z")).toBe(true);  // Sunday
  });

  it("summarises the last 30 days", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const g = glance(
      [call("2026-10-12T06:00:00Z"), call("2026-10-11T16:00:00Z"), call("2026-08-01T06:00:00Z"), call("2026-10-12T07:00:00Z", "in_progress")],
      [lead({ verdict: "qualified", booking_status: "booked", facts: { price_asked: true } }), lead({ verdict: "qualified" }), lead({ verdict: "declined", last_call_at: "2026-08-01T06:00:00Z" })],
      now,
    );
    expect(g).toMatchObject({ calls: 2, people: 2, qualified: 2, booked: 1, bookingRate: 0.5, priceAsked: 1, priceLeaks: 0, afterHoursRate: 0.5 });
    expect(g.perDay).toHaveLength(30);
    expect(g.perDay.at(-1)).toEqual({ day: "2026-10-12", count: 1 });
  });
});
