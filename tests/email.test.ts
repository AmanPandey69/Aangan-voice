import { describe, expect, it } from "vitest";
import { buildHandoffEmail, type HandoffVariant } from "@/lib/handoff/email";
import { findPriceLeaks, PriceLeakError } from "@/lib/guard/price-guard";
import type { LeadRow } from "@/lib/db/types";
import { emptyFacts } from "@/lib/domain/lead";

const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: "lead-1", phone: "+919800000001", channel: "phone", name: "Priya", email: "priya@example.com", locality: "Kothrud",
  facts: emptyFacts({
    name: "Priya", locality: "Kothrud", property_type: "apartment", bhk: 3, carpet_area_sqft: 1400, scope_type: "full_home",
    scope_rooms: ["kitchen", "living room"], property_status: "occupied", timeline_raw: "Done by March",
    decision_maker: "authorised", decision_maker_note: "Husband agrees", referral: "Shruti Joshi", price_asked: true,
    summary: "3BHK full redesign in Kothrud.",
  }),
  verdict: "qualified", urgent: false, reason: "all five criteria met", criteria: null, flags: ["price_asked", "referral"],
  uncertainties: ["decision_maker: decision-maker not confirmed"], live_verdict: "qualified", verdict_mismatch: false, price_leak: false,
  booking_status: "booked", booked_slot: "2026-10-13T05:30:00.000Z", preferred_time_raw: null, hubspot_contact_id: null, hubspot_deal_id: null,
  review_reasons: [], review_resolved_at: null, extraction_failed: false, first_seen_at: "", last_call_at: "", created_at: "", updated_at: "",
  ...over,
});
const build = (variant: HandoffVariant, l = lead()) =>
  buildHandoffEmail({ lead: l, variant, bookedSlot: l.booked_slot, ackUrl: "https://aangan.example/api/ack?token=abc.def", dashboardUrl: "https://aangan.example/calls/lead-1" });

const REQUIRED = ["Name", "Phone", "Email", "Locality", "Property type", "Area", "Scope", "Property status", "Timeline",
  "Decision-maker", "Referral", "Asked about price", "Uncertainties", "Booked slot", "Summary"];

describe("handoff email", () => {
  it("subject starts with the verdict and key facts", () =>
    expect(build("booked").subject).toBe("New consultation booked: Priya, Kothrud, 3BHK apartment"));

  it.each(["priority_booked", "manual_booking", "escalation"] as const)("%s uses the urgent subject", (v) =>
    expect(build(v, lead({ verdict: v === "escalation" ? "escalate" : "qualified", reason: "requested_human" })).subject).toMatch(/^URGENT · /));

  it("has every required field in both HTML and plain text", () => {
    const e = build("booked");
    for (const f of REQUIRED) { expect(e.text).toContain(`${f}:`); expect(e.html).toContain(f); }
    expect(e.text).toContain("Priya");
    expect(e.text).toContain("+919800000001");
    expect(e.text).toContain("1,400 sq ft");
    expect(e.text).toContain("Asked about price: Yes");
    expect(e.text).toMatch(/Booked slot: Tue, 13 Oct,? 2026, 11:00 am IST/);
    expect(e.text).toContain("3BHK full redesign in Kothrud.");
  });

  it("has a plain-text fallback with dashboard and Acknowledge links", () => {
    const e = build("booked");
    expect(e.text.length).toBeGreaterThan(200);
    expect(e.text).not.toMatch(/<[a-z]/i);
    expect(e.text).toContain("https://aangan.example/calls/lead-1");
    expect(e.text).toContain("Acknowledge");
    expect(e.html).toContain(">Acknowledge</a>");
    expect(e.html).toContain('href="https://aangan.example/api/ack?token=abc.def"');
  });

  it("manual booking shows the preferred time", () =>
    expect(build("manual_booking", lead({ booking_status: "needs_manual_booking", booked_slot: null, preferred_time_raw: "Saturday morning" })).text)
      .toContain("NOT BOOKED. Preferred time: Saturday morning"));

  it("never includes a volunteered budget figure", () => {
    const e = build("budget_review", lead({ verdict: "escalate", reason: "budget_review",
      facts: emptyFacts({ budget_volunteered: true, budget_raw: "1 to 1.5 lakh maximum", budget_concern: true, summary: "s" }) }));
    expect(e.text).not.toContain("lakh");
    expect(e.text).toContain("Budget: Volunteered by the caller (see dashboard)");
    for (const p of [e.subject, e.text, e.html]) expect(findPriceLeaks(p)).toEqual([]);
  });

  it.each(["booked", "priority_booked", "manual_booking", "escalation", "budget_review", "reminder"] as const)("%s has no pricing", (v) => {
    const e = build(v);
    for (const p of [e.subject, e.text, e.html]) expect(findPriceLeaks(p)).toEqual([]);
  });

  it("refuses to render if a price sneaks in, and the minimal fallback is clean", () => {
    const leaky = lead({ facts: emptyFacts({ summary: "Quoted 2,000 per sq ft" }) });
    expect(() => build("booked", leaky)).toThrow(PriceLeakError);
    const minimal = buildHandoffEmail({ lead: leaky, variant: "booked", bookedSlot: leaky.booked_slot, ackUrl: "https://x/a", dashboardUrl: "https://x/d", minimal: true });
    expect(minimal.text).toContain("Phone: +919800000001");
    expect(minimal.text).not.toContain("per sq ft");
  });

  it("escapes HTML in caller-provided text", () =>
    expect(build("booked", lead({ name: "<script>x</script>" })).html).not.toContain("<script>"));
});
