import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/rules/engine";
import { matchLocality } from "@/lib/rules/locality";
import { emptyFacts, type LeadFacts } from "@/lib/domain/lead";
import { rulesWith } from "@/config/rules";
import { QUESTIONS } from "@/lib/rules/copy";

const NOW = new Date("2026-10-08T10:00:00+05:30");
const good = (over: Partial<LeadFacts> = {}): LeadFacts => emptyFacts({
  locality: "Baner", property_type: "apartment", segment: "residential", bhk: 2, carpet_area_sqft: 900,
  scope_type: "full_home", wants_execution: true, completion_by: "2027-03-01", site_available_from: "2026-10-08",
  decision_maker: "self", summary: "test", ...over,
});
const run = (f: LeadFacts, opts: Partial<Parameters<typeof evaluate>[1]> = {}) => evaluate(f, { now: NOW, ...opts });

describe("locality lookup", () => {
  it.each([
    ["Kothrud", "in"], ["Dahanukar Colony", "in"], ["Pimple Saudagar", "in"], ["Hinjawadi Phase 1", "in"],
    ["Magarpatta, Cybercity", "in"], ["Talegaon Dabhade, near Pune", "out"], ["Nashik", "out"],
    ["Mumbai", "out"], ["Lonavala", "out"], ["Kharadi", "unknown"], ["Nanded City", "unknown"],
  ])("%s → %s", (loc, area) => expect(matchLocality(loc).area).toBe(area));

  it("does not match partial words", () => expect(matchLocality("Maundhwa").area).toBe("unknown"));
  it("out-of-area wins over a Pune mention", () => expect(matchLocality("Talegaon", "Pune").area).toBe("out"));
});

describe("criterion 1 — real project", () => {
  it("passes a full home with execution", () => expect(run(good()).criteria.real_project.status).toBe("pass"));
  it.each(["advice_only", "decor_only", "furniture_only", "vastu_only", "structural_only"] as const)(
    "fails %s", (s) => expect(run(good({ scope_type: s })).criteria.real_project.status).toBe("fail"));
  it("fails when the caller only wants ideas", () =>
    expect(run(good({ scope_type: null, wants_execution: false })).criteria.real_project.status).toBe("fail"));
  it.each(["restaurant", "hotel", "retail", "gym"] as const)("fails %s", (p) =>
    expect(run(good({ property_type: p, segment: "commercial" })).verdict).toBe("declined"));
  it("a single room with execution is fine", () =>
    expect(run(good({ scope_type: "single_room" })).verdict).toBe("qualified"));
  it("is unclear when scope is unknown", () =>
    expect(run(good({ scope_type: null, wants_execution: null })).criteria.real_project.status).toBe("unclear"));
  it("declines commercial below the minimum and flags it", () => {
    const e = run(good({ property_type: "office", segment: "commercial", scope_type: "commercial_fitout", carpet_area_sqft: 180 }));
    expect(e.verdict).toBe("declined");
    expect(e.flags).toContain("small_commercial");
  });
  it("commercial minimum can be switched off", () => {
    const f = good({ property_type: "office", segment: "commercial", scope_type: "commercial_fitout", carpet_area_sqft: 180 });
    expect(run(f, { rules: rulesWith({ commercialMinSqftEnabled: false }) }).verdict).toBe("qualified");
  });
  it("large commercial is unclear, never declined", () => {
    const e = run(good({ property_type: "office", segment: "commercial", scope_type: "commercial_fitout", carpet_area_sqft: 3600 }));
    expect(e.criteria.real_project.status).toBe("unclear");
    expect(e.verdict).toBe("qualified");
    expect(e.flags).toContain("large_commercial");
  });
});

describe("criterion 2 — service area", () => {
  it("fails out-of-area", () => expect(run(good({ locality: "Nashik" })).verdict).toBe("declined"));
  it("unknown locality is unclear and qualifies with a note", () => {
    const e = run(good({ locality: "Kharadi" }));
    expect(e.criteria.service_area.status).toBe("unclear");
    expect(e.verdict).toBe("qualified");
    expect(e.flags).toContain("unknown_locality");
  });
  it("unknown locality can be configured to fail", () =>
    expect(run(good({ locality: "Kharadi" }), { rules: rulesWith({ unknownLocalityOutcome: "fail" }) }).verdict).toBe("declined"));
});

describe("criterion 3 — timeline", () => {
  it("fails completion inside the minimum lead time", () =>
    expect(run(good({ completion_by: "2026-10-29" })).criteria.timeline.status).toBe("fail"));
  it("passes exactly at the minimum", () =>
    expect(run(good({ completion_by: "2026-11-19T10:00:00+05:30" })).criteria.timeline.status).toBe("pass"));
  it("8–10 week minimum is a config switch", () =>
    expect(run(good({ completion_by: "2026-11-26" }), { rules: rulesWith({ minWeeksToCompletion: 10 }) }).criteria.timeline.status).toBe("fail"));
  it("late site availability is unclear by default", () =>
    expect(run(good({ completion_by: null, site_available_from: "2027-04-01" })).criteria.timeline.status).toBe("unclear"));
  it("late site availability can fail", () =>
    expect(run(good({ completion_by: null, site_available_from: "2027-04-01" }), { rules: rulesWith({ siteAvailableLateOutcome: "fail" }) }).verdict).toBe("declined"));
  it("missing timeline is unclear", () =>
    expect(run(good({ completion_by: null, site_available_from: null })).criteria.timeline.status).toBe("unclear"));
});

describe("criterion 4 — budget", () => {
  it("no budget mentioned passes", () => expect(run(good()).criteria.budget.status).toBe("pass"));
  it("volunteered budget with no concern passes", () =>
    expect(run(good({ budget_volunteered: true, budget_raw: "x" })).verdict).toBe("qualified"));
  it("budget concern is escalated, never declined", () => {
    const e = run(good({ budget_volunteered: true, budget_concern: true }));
    expect(e.verdict).toBe("escalate");
    expect(e.urgent).toBe(false);
    expect(e.escalation_reason).toBe("budget_review");
    expect(e.next_action).toBe("close");
  });
  it("budget concern can instead qualify with a flag", () => {
    const e = run(good({ budget_volunteered: true, budget_concern: true }), { rules: rulesWith({ budgetConcernOutcome: "qualify_with_flag" }) });
    expect(e.verdict).toBe("qualified");
    expect(e.flags).toContain("budget_review");
  });
  it("asking about price never disqualifies", () => {
    const e = run(good({ price_asked: true }));
    expect(e.verdict).toBe("qualified");
    expect(e.flags).toContain("price_asked");
  });
});

describe("criterion 5 — decision-maker", () => {
  it.each(["self", "authorised", "represented_will_attend"] as const)("%s passes", (d) =>
    expect(run(good({ decision_maker: d })).criteria.decision_maker.status).toBe("pass"));
  it.each(["researching_only", "unknown"] as const)("%s is unclear but still qualifies", (d) => {
    const e = run(good({ decision_maker: d }));
    expect(e.criteria.decision_maker.status).toBe("unclear");
    expect(e.verdict).toBe("qualified");
    expect(e.uncertainties.join()).toMatch(/decision_maker/);
  });
});

describe("decline thresholds", () => {
  it("one failure declines by default with the single-failure close", () => {
    const e = run(good({ locality: "Mumbai" }));
    expect(e.verdict).toBe("declined");
    expect(e.say).toMatch(/may not be something/);
  });
  it("two failures use the qualified.md wording", () =>
    expect(run(good({ locality: "Mumbai", scope_type: "advice_only" })).say).toMatch(/right fit for us right now/));
  it("threshold of two lets a single failure through", () =>
    expect(run(good({ locality: "Mumbai" }), { rules: rulesWith({ minFailedCriteriaToDecline: 2 }) }).verdict).toBe("qualified"));
  it("declined reasons are stored but say never contains the word unqualified", () => {
    const e = run(good({ locality: "Mumbai", scope_type: "advice_only" }));
    expect(e.reason).toMatch(/service_area/);
    expect(e.say!.toLowerCase()).not.toContain("qualif");
  });
});

describe("escalation", () => {
  it.each([
    [{ existing_client_complaint: true }, "existing_client_complaint"],
    [{ requested_human: true }, "requested_human"],
    [{ abusive: true }, "abusive_caller"],
    [{ misunderstood_count: 2 }, "misunderstood_repeatedly"],
  ] as const)("%o → %s, urgent", (over, reason) => {
    const e = run(good(over));
    expect(e.verdict).toBe("escalate");
    expect(e.urgent).toBe(true);
    expect(e.escalation_reason).toBe(reason);
  });
  it("misunderstood once is not an escalation", () => expect(run(good({ misunderstood_count: 1 })).verdict).toBe("qualified"));
  it("frustration alone is a flag, not an escalation", () => {
    const e = run(good({ frustrated: true }));
    expect(e.verdict).toBe("qualified");
    expect(e.flags).toContain("handle_with_care");
  });
  it("escalation beats a failed criterion", () =>
    expect(run(good({ locality: "Mumbai", requested_human: true })).verdict).toBe("escalate"));
});

describe("priority", () => {
  it("flags large projects as priority and urgent", () => {
    const e = run(good({ carpet_area_sqft: 5500 }));
    expect(e.flags).toContain("priority");
    expect(e.urgent).toBe(true);
  });
});

describe("live mode", () => {
  it("asks one direct question for the first unclear core criterion", () => {
    const e = run(good({ locality: null }), { mode: "live" });
    expect(e.next_action).toBe("ask");
    expect(e.question).toBe(QUESTIONS.service_area);
  });
  it("does not ask the same question twice", () => {
    const e = run(good({ locality: null }), { mode: "live", asked: ["service_area"] });
    expect(e.next_action).toBe("book");
  });
  it("never asks about budget or decision-maker", () => {
    const e = run(good({ decision_maker: "unknown" }), { mode: "live" });
    expect(e.next_action).toBe("book");
  });
  it("offers a later timeline once, then closes", () => {
    const f = good({ completion_by: "2026-10-29" });
    expect(run(f, { mode: "live" }).question).toBe(QUESTIONS.timeline_flex);
    expect(run(f, { mode: "live", asked: ["timeline_flex"] }).next_action).toBe("close");
  });
  it("closes without booking on a budget concern", () => {
    const e = run(good({ budget_volunteered: true, budget_concern: true }), { mode: "live" });
    expect(e.next_action).toBe("close");
  });
  it("escalates immediately", () => expect(run(good({ requested_human: true }), { mode: "live" }).next_action).toBe("escalate"));
});
