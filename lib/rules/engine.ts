import { DEFAULT_RULES, type RulesConfig } from "@/config/rules";
import type {
  CriterionKey, CriterionResult, Evaluation, Flag, LeadFacts, NextAction, Verdict,
} from "@/lib/domain/lead";
import { matchLocality } from "./locality";
import {
  BUDGET_CLOSE, ESCALATION_LINE, GRACEFUL_CLOSE, GRACEFUL_CLOSE_MULTI, QUESTIONS,
} from "./copy";

/**
 * Deterministic qualification engine for qualified.md's five criteria.
 * The LLM only extracts facts; every decision is made here.
 */

export interface EvaluateOptions {
  /** Date of the enquiry; timeline weeks are measured from here. */
  now: Date;
  rules?: RulesConfig;
  /** "live" = mid-call guidance; "final" = post-call verdict. */
  mode?: "live" | "final";
  /** Questions already asked on this call (criterion keys or "timeline_flex"). */
  asked?: string[];
}

const OUT_OF_SCOPE_PROPERTY = new Set(["retail", "restaurant", "hotel", "gym"]);
const NOT_A_PROJECT_SCOPE = new Set(["advice_only", "decor_only", "furniture_only", "vastu_only", "structural_only"]);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const pass = (reason: string): CriterionResult => ({ status: "pass", reason });
const fail = (reason: string): CriterionResult => ({ status: "fail", reason });
const unclear = (reason: string): CriterionResult => ({ status: "unclear", reason });

function weeksFrom(now: Date, iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (t - now.getTime()) / WEEK_MS;
}

function isCommercial(f: LeadFacts): boolean {
  if (f.segment) return f.segment === "commercial";
  return ["office", "clinic", "studio", "coworking", "retail", "restaurant", "hotel", "gym"].includes(f.property_type ?? "");
}

export function checkRealProject(f: LeadFacts, rules: RulesConfig): CriterionResult {
  if (f.property_type && OUT_OF_SCOPE_PROPERTY.has(f.property_type))
    return fail(`${f.property_type} interiors are outside the studio's scope`);
  if (f.scope_type && NOT_A_PROJECT_SCOPE.has(f.scope_type))
    return fail(`wants ${f.scope_type.replace("_", " ")}, not a redesign with execution`);
  if (f.wants_execution === false) return fail("wants ideas/advice only, not design with execution");

  if (isCommercial(f) && f.carpet_area_sqft != null) {
    if (rules.commercialMinSqftEnabled && f.carpet_area_sqft < rules.commercialMinSqft)
      return fail(`commercial space of ${f.carpet_area_sqft} sq ft is below the commercial minimum`);
    if (f.carpet_area_sqft > rules.commercialMaxSqft)
      return unclear(`commercial space of ${f.carpet_area_sqft} sq ft is above the usual commercial maximum`);
  }

  if (f.scope_type) return pass(`${f.scope_type.replace("_", " ")} with execution`);
  if (f.wants_execution === true) return pass("wants design with execution");
  return unclear("scope not established");
}

export function checkServiceArea(f: LeadFacts, rules: RulesConfig): CriterionResult {
  const m = matchLocality(f.locality, f.city);
  if (m.area === "in") return pass(`${m.locality} is in ${m.zone === "pcmc" ? "PCMC" : "Pune city"}`);
  if (m.area === "out") return fail(`${m.locality} is outside the Pune/PCMC service area`);
  if (!m.locality) return unclear("location not given");
  return rules.unknownLocalityOutcome === "fail"
    ? fail(`${m.locality} is not on the service-area list`)
    : unclear(`${m.locality} is not on the service-area list — confirm it is within Pune/PCMC`);
}

export function checkTimeline(f: LeadFacts, now: Date, rules: RulesConfig): CriterionResult {
  const toCompletion = weeksFrom(now, f.completion_by);
  const toSite = weeksFrom(now, f.site_available_from);

  if (toCompletion != null && toCompletion < rules.minWeeksToCompletion)
    return fail(`needs completion in about ${Math.max(0, Math.round(toCompletion))} weeks; minimum is ${rules.minWeeksToCompletion}`);

  if (toSite != null && toSite > rules.siteAvailableWithinWeeks) {
    const msg = `site available in about ${Math.round(toSite)} weeks; window is ${rules.siteAvailableWithinWeeks}`;
    return rules.siteAvailableLateOutcome === "fail" ? fail(msg) : unclear(msg);
  }

  if (toCompletion != null || toSite != null) return pass(f.timeline_raw ?? "timeline workable");
  return unclear("timeline not established");
}

/** Never fails: per the studio's choice a low budget is escalated, not declined. */
export function checkBudget(f: LeadFacts): CriterionResult {
  if (!f.budget_volunteered) return pass("budget not mentioned — treated as qualified");
  if (f.budget_concern) return unclear("volunteered budget may not match the described scope — for studio head review");
  return pass("budget volunteered, no obvious mismatch");
}

/** Never fails: qualified.md says unclear on 5 is treated as qualified with a note. */
export function checkDecisionMaker(f: LeadFacts): CriterionResult {
  switch (f.decision_maker) {
    case "self": return pass("caller is the decision-maker");
    case "authorised": return pass("caller is authorised to go ahead");
    case "represented_will_attend": return pass("decision-makers will attend the consultation");
    case "researching_only": return unclear("caller is researching for someone else");
    default: return unclear("decision-maker not confirmed");
  }
}

export function evaluate(f: LeadFacts, opts: EvaluateOptions): Evaluation {
  const rules = opts.rules ?? DEFAULT_RULES;
  const mode = opts.mode ?? "final";
  const asked = new Set(opts.asked ?? []);

  const criteria: Record<CriterionKey, CriterionResult> = {
    real_project: checkRealProject(f, rules),
    service_area: checkServiceArea(f, rules),
    timeline: checkTimeline(f, opts.now, rules),
    budget: checkBudget(f),
    decision_maker: checkDecisionMaker(f),
  };

  const flags = new Set<Flag>();
  if (f.price_asked) flags.add("price_asked");
  if (f.carpet_area_sqft != null && f.carpet_area_sqft >= rules.priorityMinSqft) flags.add("priority");
  if (f.rented) flags.add("rented");
  if (f.structural_changes_requested) flags.add("structural_requested");
  if (f.frustrated) flags.add("handle_with_care");
  if (f.referral) flags.add("referral");
  if (isCommercial(f) && f.carpet_area_sqft != null) {
    if (f.carpet_area_sqft < rules.commercialMinSqft) flags.add("small_commercial");
    if (f.carpet_area_sqft > rules.commercialMaxSqft) flags.add("large_commercial");
  }
  if (f.budget_volunteered && f.budget_concern) flags.add("budget_review");
  if (matchLocality(f.locality, f.city).area === "unknown" && (f.locality || f.city)) flags.add("unknown_locality");
  if (criteria.decision_maker.status === "unclear") flags.add("decision_maker_unclear");

  const uncertainties = (Object.entries(criteria) as [CriterionKey, CriterionResult][])
    .filter(([, r]) => r.status === "unclear")
    .map(([k, r]) => `${k}: ${r.reason}`);

  const failed = (Object.entries(criteria) as [CriterionKey, CriterionResult][]).filter(([, r]) => r.status === "fail");

  // 1. Escalations override everything — this may not be a new lead at all.
  const escalation_reason =
    rules.escalateOnExistingClientComplaint && f.existing_client_complaint ? "existing_client_complaint"
    : rules.escalateOnRequestForHuman && f.requested_human ? "requested_human"
    : rules.escalateOnAbusiveCaller && f.abusive ? "abusive_caller"
    : f.misunderstood_count >= rules.escalateAfterMisunderstoodCount ? "misunderstood_repeatedly"
    : null;

  const base = { criteria, flags: [...flags], uncertainties };

  if (escalation_reason) {
    return { ...base, verdict: "escalate", urgent: true, reason: escalation_reason, escalation_reason,
      next_action: "escalate", question: null, say: ESCALATION_LINE };
  }

  // 2. Failed criteria. Live: offer one chance to move a too-tight timeline.
  if (failed.length >= rules.minFailedCriteriaToDecline) {
    const onlyTimeline = failed.length === 1 && failed[0][0] === "timeline";
    if (mode === "live" && onlyTimeline && !asked.has("timeline_flex")) {
      return { ...base, verdict: "declined", urgent: false, reason: failed[0][1].reason, escalation_reason: null,
        next_action: "ask", question: QUESTIONS.timeline_flex, say: null };
    }
    return { ...base, verdict: "declined", urgent: false,
      reason: failed.map(([k, r]) => `${k}: ${r.reason}`).join("; "), escalation_reason: null,
      next_action: "close", question: null, say: failed.length >= 2 ? GRACEFUL_CLOSE_MULTI : GRACEFUL_CLOSE };
  }

  // 3. Live: ask one direct question for the first unclear core criterion (1–3).
  if (mode === "live") {
    for (const key of ["real_project", "service_area", "timeline"] as const) {
      if (criteria[key].status === "unclear" && !asked.has(key)) {
        return { ...base, verdict: "qualified", urgent: false, reason: `asking about ${key}`, escalation_reason: null,
          next_action: "ask", question: QUESTIONS[key], say: null };
      }
    }
  }

  // 4. Budget concern: never declined; studio head decides.
  if (flags.has("budget_review") && rules.budgetConcernOutcome === "escalate") {
    return { ...base, verdict: "escalate", urgent: false, reason: "budget_review", escalation_reason: "budget_review",
      next_action: "close", question: null, say: BUDGET_CLOSE };
  }

  // 5. Remaining uncertainty on 1–3 after the call.
  const coreUnclear = (["real_project", "service_area", "timeline"] as const).some((k) => criteria[k].status === "unclear");
  if (mode === "final" && coreUnclear && rules.postCallUnclearOutcome === "escalate") {
    return { ...base, verdict: "escalate", urgent: false, reason: "unclear_after_call", escalation_reason: "unclear_after_call",
      next_action: "book", question: null, say: null };
  }

  const verdict: Verdict = "qualified";
  const next_action: NextAction = "book";
  return { ...base, verdict, urgent: flags.has("priority"),
    reason: uncertainties.length ? `qualified with notes: ${uncertainties.join("; ")}` : "all five criteria met",
    escalation_reason: null, next_action, question: null, say: null };
}
