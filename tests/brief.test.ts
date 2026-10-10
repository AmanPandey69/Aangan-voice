import { describe, expect, it } from "vitest";
import { briefText, googleCalendarHref, prepQuestions, telHref, whatsappHref } from "@/lib/handoff/brief";
import { emptyFacts } from "@/lib/domain/lead";
import type { LeadRow } from "@/lib/db/types";
import { findPriceLeaks } from "@/lib/guard/price-guard";

const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: "L1", phone: "+919800000001", channel: "phone", name: "Priya Shah", email: null, locality: "Kothrud",
  facts: emptyFacts({ bhk: 3, property_type: "apartment", carpet_area_sqft: 1400, summary: "3BHK redesign", price_asked: true, referral: "Shruti", scope_rooms: ["kitchen"] }),
  verdict: "qualified", urgent: false, reason: null,
  criteria: { real_project: { status: "pass", reason: "" }, service_area: { status: "pass", reason: "" }, timeline: { status: "unclear", reason: "" }, budget: { status: "pass", reason: "" }, decision_maker: { status: "unclear", reason: "" } },
  flags: ["priority"], uncertainties: [], live_verdict: null, verdict_mismatch: false, price_leak: false,
  booking_status: "booked", booked_slot: "2026-10-13T05:30:00.000Z", preferred_time_raw: null, hubspot_contact_id: null, hubspot_deal_id: null,
  review_reasons: [], review_resolved_at: null, extraction_failed: false, first_seen_at: "", last_call_at: "", created_at: "", updated_at: "", ...over,
});

describe("consultation brief", () => {
  it("turns open questions into things to ask", () => {
    const q = prepQuestions(lead()).join(" ");
    expect(q).toMatch(/when they need it finished/);
    expect(q).toMatch(/final decision/);
    expect(q).toMatch(/pricing works/);
    expect(q).toMatch(/principal designer/);
    expect(q).toMatch(/Shruti/);
    expect(q).not.toMatch(/design and execution/);
  });
  it("links: tel, WhatsApp with a prefilled message, Google Calendar 1h slot", () => {
    expect(telHref(lead())).toBe("tel:+919800000001");
    expect(whatsappHref(lead())).toMatch(/^https:\/\/wa\.me\/919800000001\?text=Hi%20Priya/);
    expect(googleCalendarHref(lead(), "https://x/calls/L1")).toContain("dates=20261013T053000Z%2F20261013T063000Z");
  });
  it("no phone links for online calls without a number", () => {
    expect(telHref(lead({ phone: "online:webrtc-1" }))).toBeNull();
    expect(whatsappHref(lead({ phone: "online:webrtc-1" }))).toBeNull();
  });
  it("brief never contains a price", () => {
    const b = briefText(lead({ facts: emptyFacts({ budget_volunteered: true, budget_raw: "10 lakh", budget_concern: true, summary: "s" }) }), "https://x");
    expect(findPriceLeaks(b)).toEqual([]);
    expect(b).not.toContain("lakh");
  });
});
