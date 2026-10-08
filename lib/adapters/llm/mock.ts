import { emptyFacts, type LeadFacts } from "@/lib/domain/lead";
import { matchLocality } from "@/lib/rules/locality";
import { ALIASES, OUT_OF_AREA, PCMC, PUNE_CITY } from "@/config/localities";
import type { ExtractionInput, LLMProvider } from "./types";

/**
 * Keyless stand-in for the LLM. A small keyword extractor good enough for
 * local runs and the smoke test. Tests can register exact answers with
 * `MockLLM.register(callId, facts)` (the replay suite does this).
 */
export class MockLLM implements LLMProvider {
  readonly name = "mock";
  private static canned = new Map<string, unknown>();

  static register(callId: string, raw: unknown) { MockLLM.canned.set(callId, raw); }
  static clear() { MockLLM.canned.clear(); }

  async extractLead(input: ExtractionInput) {
    const raw = MockLLM.canned.has(input.callId) ? MockLLM.canned.get(input.callId) : heuristicExtract(input);
    return { raw, usage: { model: "mock", inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  }
}

const has = (t: string, re: RegExp) => re.test(t);

export function heuristicExtract(input: ExtractionInput): LeadFacts {
  const callerText = input.transcript.split("\n").filter((l) => /^caller:/i.test(l)).join(" ");
  const t = callerText.toLowerCase();
  const allPlaces = [...OUT_OF_AREA, ...PCMC, ...PUNE_CITY, ...Object.keys(ALIASES)];
  const locality = allPlaces.find((p) => ` ${t.replace(/[^a-z ]/g, " ")} `.includes(` ${p} `)) ?? null;
  const sqft = t.match(/(\d[\d,]*)\s*(sq\.?\s*ft|square feet)/);
  const bhk = t.match(/(\d)\s*bhk/);
  const commercial = has(t, /\b(office|clinic|coworking|startup|workstations)\b/);
  const name = callerText.match(/\b(?:i'm|i am|this is|my name is)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/)?.[1] ?? null;
  const callDate = new Date(input.callStartedAt);
  const monthIdx = ["january","february","march","april","may","june","july","august","september","october","november","december"]
    .findIndex((m) => has(t, new RegExp(`\\b(by|before|in)\\s+${m}\\b`)));
  let completion_by: string | null = null;
  if (monthIdx >= 0) {
    const y = callDate.getMonth() >= monthIdx ? callDate.getFullYear() + 1 : callDate.getFullYear();
    completion_by = `${y}-${String(monthIdx + 1).padStart(2, "0")}-01`;
  }
  const weeks = t.match(/(\w+)\s+weeks?\s+(away|maximum)/);
  if (weeks) {
    const n = Number(weeks[1]) || ({ two: 2, three: 3, four: 4, five: 5, six: 6 } as Record<string, number>)[weeks[1]] || 0;
    completion_by = new Date(callDate.getTime() + n * 7 * 864e5).toISOString().slice(0, 10);
  }
  const adviceOnly = has(t, /\b(ideas|suggestions|advise|advice)\b/) && !has(t, /\bexecution\b/);
  return emptyFacts({
    name, phone: input.callerPhone,
    locality, city: matchLocality(locality).area === "in" ? "Pune" : null,
    property_type: has(t, /restaurant|cafe/) ? "restaurant" : has(t, /\bgym\b/) ? "gym" : has(t, /coworking/) ? "coworking"
      : commercial ? "office" : has(t, /villa/) ? "villa" : bhk || has(t, /flat|apartment/) ? "apartment" : null,
    segment: commercial || has(t, /restaurant|gym/) ? "commercial" : bhk ? "residential" : null,
    bhk: bhk ? Number(bhk[1]) : null,
    carpet_area_sqft: sqft ? Number(sqft[1].replace(/,/g, "")) : null,
    scope_type: adviceOnly ? "advice_only" : commercial ? "commercial_fitout"
      : has(t, /full|whole|complete|end-to-end|everything/) ? "full_home"
      : has(t, /kitchen|bedroom|living room|wardrobe/) ? "partial_home" : null,
    wants_execution: adviceOnly ? false : has(t, /redo|redesign|design|fitout|interiors/) ? true : null,
    rented: has(t, /rent(ed)?\b|lease/) || null,
    timeline_raw: completion_by ? "from transcript" : null,
    completion_by,
    site_available_from: has(t, /moved in|been here|bare shell|empty|possession was/) ? input.callStartedAt.slice(0, 10) : null,
    decision_maker: has(t, /founder|owner|husband and i|wife and i|go ahead/) ? "self" : "unknown",
    referral: callerText.match(/(?:from a friend|referred by|asked me to call)[^.]*/i)?.[0] ?? null,
    budget_volunteered: has(t, /budget/),
    budget_raw: has(t, /budget/) ? "volunteered (see transcript)" : null,
    budget_concern: false,
    price_asked: has(t, /cost|price|how much|ballpark|range|per sq/),
    existing_client_complaint: has(t, /my designer|my project has been/),
    requested_human: has(t, /speak to someone|talk to a (person|human)|senior person|call me back/),
    abusive: false,
    frustrated: has(t, /not acceptable|not a good sign|no one replied|frustrat/),
    misunderstood_count: 0,
    summary: "Enquiry captured by mock extractor.",
  });
}
