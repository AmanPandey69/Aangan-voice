/**
 * Qualification rules configuration.
 *
 * Every place where the source docs conflict or are silent is a flag here,
 * with the default we chose and why. These are listed again in the README
 * under "Open decisions". Change a value here, re-run `npm test`, and the
 * replay suite shows the effect on T01–T20.
 *
 * NOTHING in this file may be a price. Pricing lives only in the internal
 * pricing guide, which is deliberately not part of this repo.
 */

export type RulesConfig = typeof DEFAULT_RULES;

export const DEFAULT_RULES = {
  /**
   * DECISION 1 — how many failed criteria decline a lead.
   * qualified.md says both "if it fails one, close gracefully" and
   * "two or more criteria fail: decline". The expected outcomes for
   * T03/T04/T18/T19 (one failure each, all declined) require 1.
   * The two-failure wording is still used for the closing line.
   */
  minFailedCriteriaToDecline: 1,

  /**
   * DECISION 2 — timeline.
   * services.md: cannot begin a project that must be ready in under 6 weeks.
   * qualified.md: site must be available for execution within 8–10 weeks.
   * We apply both, as two separate checks:
   *  - required completion date must be at least `minWeeksToCompletion` away
   *  - site must be available within `siteAvailableWithinWeeks`
   * Using 8–10 weeks as the completion minimum would risk declining T02.
   */
  minWeeksToCompletion: 6,
  siteAvailableWithinWeeks: 10,
  /** What a site available later than the window means: "unclear" (ask / note) or "fail". */
  siteAvailableLateOutcome: "unclear" as "unclear" | "fail",

  /**
   * DECISION 3 — commercial size limits.
   * The 500 sq ft minimum appears only on the T18 call, not in services.md.
   * Default ON because T18 is expected to decline. Such leads are also put
   * in the review queue ("small_commercial") so Nikhil can confirm.
   * The ~3,000 sq ft maximum is "approximately", so larger offices are
   * marked unclear (note + review), never auto-declined.
   */
  commercialMinSqftEnabled: true,
  commercialMinSqft: 500,
  commercialMaxSqft: 3000,

  /**
   * DECISION 4 — volunteered budget (criterion 4).
   * Chosen by the studio: never auto-decline on budget. If the caller
   * volunteers a budget that looks clearly too low for the scope, the
   * agent closes gracefully without booking and the lead is escalated
   * (non-urgent, reason "budget_review") for Nikhil to decide.
   * "qualify_with_flag" would instead book and warn the designer.
   */
  budgetConcernOutcome: "escalate" as "escalate" | "qualify_with_flag",

  /**
   * DECISION 5 — what remains unclear after the call.
   * qualified.md: unclear on 1–3 → ask one question; unclear on 4–5 →
   * treat as qualified with a note. Several expected-qualified calls
   * (T11, T13, T14, T16) never covered every criterion, and wrongly
   * declining a good lead is worse than forwarding a weak one, so
   * post-call "unclear" qualifies with the uncertainty noted.
   */
  postCallUnclearOutcome: "qualify_with_note" as "qualify_with_note" | "escalate",

  /**
   * DECISION 6 — what counts as an escalation.
   * T16 is frustrated but expected to qualify, so frustration alone is a
   * "handle with care" flag, not an escalation.
   */
  escalateOnExistingClientComplaint: true,
  escalateOnRequestForHuman: true,
  escalateOnAbusiveCaller: true,
  escalateAfterMisunderstoodCount: 2,

  /**
   * DECISION 7 — unknown localities ("and adjoining areas").
   * A locality not on either list is "unclear": the agent asks one
   * question; if still unclear after the call it qualifies with a note
   * and goes to the review queue. It is never auto-declined.
   */
  unknownLocalityOutcome: "unclear" as "unclear" | "fail",

  /** Priority flag for large projects (carpet area, any segment). */
  priorityMinSqft: 2000,

  /** Handoff acknowledgement: reminder after N minutes, flag after M. */
  ackReminderAfterMinutes: 120,
  ackFlagAfterMinutes: 24 * 60,

  /** Live-call limits used by the agent prompt and the evaluate tool. */
  maxCallMinutes: 8,
  silenceRepromptSeconds: 6,
  silenceHangupSeconds: 20,
};

/** Allow tests and env-driven overrides without mutating the defaults. */
export function rulesWith(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return { ...DEFAULT_RULES, ...overrides };
}
