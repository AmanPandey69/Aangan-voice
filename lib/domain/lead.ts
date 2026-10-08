import { z } from "zod";

/**
 * Channel-independent facts about an enquiry. Produced by LLM extraction
 * from a phone transcript today; a WhatsApp thread or web form can be
 * mapped into the same shape later and run through the same rules.
 */

export const Channel = z.enum(["phone", "whatsapp", "web_form"]);
export type Channel = z.infer<typeof Channel>;

export const PropertyType = z.enum([
  "apartment", "independent_house", "villa", "office", "clinic", "studio",
  "coworking", "retail", "restaurant", "hotel", "gym", "other",
]);

export const ScopeType = z.enum([
  "full_home", "partial_home", "single_room", "commercial_fitout",
  "advice_only", "decor_only", "furniture_only", "vastu_only", "structural_only",
]);

export const PropertyStatus = z.enum([
  "occupied", "new_possession", "under_construction", "bare_shell", "vacant", "unknown",
]);

export const DecisionMaker = z.enum([
  "self", "authorised", "represented_will_attend", "researching_only", "unknown",
]);

export const LeadFactsSchema = z.object({
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),

  locality: z.string().nullable().describe("Neighbourhood / area as the caller said it"),
  city: z.string().nullable(),

  property_type: PropertyType.nullable(),
  segment: z.enum(["residential", "commercial"]).nullable(),
  bhk: z.number().int().positive().nullable(),
  carpet_area_sqft: z.number().positive().nullable(),

  scope_type: ScopeType.nullable(),
  scope_rooms: z.array(z.string()),
  wants_execution: z.boolean().nullable().describe("true = design + execution; false = advice/ideas only"),

  property_status: PropertyStatus.nullable(),
  rented: z.boolean().nullable(),
  structural_changes_requested: z.boolean().nullable(),

  timeline_raw: z.string().nullable(),
  completion_by: z.string().nullable().describe("ISO date the work must be finished by"),
  site_available_from: z.string().nullable().describe("ISO date the site can be worked on"),

  decision_maker: DecisionMaker,
  decision_maker_note: z.string().nullable(),

  referral: z.string().nullable(),
  source: z.string().nullable(),

  budget_volunteered: z.boolean(),
  budget_raw: z.string().nullable().describe("Only if the caller volunteered it"),
  budget_concern: z.boolean().describe("Volunteered budget looks clearly too low for the described scope"),

  price_asked: z.boolean(),

  existing_client_complaint: z.boolean(),
  requested_human: z.boolean(),
  abusive: z.boolean(),
  frustrated: z.boolean(),
  misunderstood_count: z.number().int().min(0),

  preferred_time_raw: z.string().nullable(),
  language: z.string().nullable(),
  summary: z.string().describe("One line, no prices"),
});

export type LeadFacts = z.infer<typeof LeadFactsSchema>;

/** A blank set of facts, used by the live evaluate tool and tests. */
export function emptyFacts(over: Partial<LeadFacts> = {}): LeadFacts {
  return {
    name: null, phone: null, email: null, locality: null, city: null,
    property_type: null, segment: null, bhk: null, carpet_area_sqft: null,
    scope_type: null, scope_rooms: [], wants_execution: null,
    property_status: null, rented: null, structural_changes_requested: null,
    timeline_raw: null, completion_by: null, site_available_from: null,
    decision_maker: "unknown", decision_maker_note: null,
    referral: null, source: null,
    budget_volunteered: false, budget_raw: null, budget_concern: false,
    price_asked: false,
    existing_client_complaint: false, requested_human: false, abusive: false,
    frustrated: false, misunderstood_count: 0,
    preferred_time_raw: null, language: null, summary: "",
    ...over,
  };
}

export const CriterionKey = z.enum(["real_project", "service_area", "timeline", "budget", "decision_maker"]);
export type CriterionKey = z.infer<typeof CriterionKey>;

export type CriterionStatus = "pass" | "fail" | "unclear";
export type Verdict = "qualified" | "declined" | "escalate";

export interface CriterionResult {
  status: CriterionStatus;
  reason: string;
}

export type Flag =
  | "price_asked" | "priority" | "rented" | "structural_requested"
  | "handle_with_care" | "referral" | "small_commercial" | "large_commercial"
  | "budget_review" | "unknown_locality" | "decision_maker_unclear";

export type NextAction = "ask" | "book" | "close" | "escalate";

export interface Evaluation {
  verdict: Verdict;
  urgent: boolean;
  reason: string;
  criteria: Record<CriterionKey, CriterionResult>;
  flags: Flag[];
  uncertainties: string[];
  escalation_reason: string | null;
  /** Live-call guidance (also computed post-call, for comparison). */
  next_action: NextAction;
  question: string | null;
  say: string | null;
}
