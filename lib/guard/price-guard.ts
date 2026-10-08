/**
 * Price guard. Finds anything in outbound text that could communicate a
 * price: currency, money units, per-sq-ft rates, "starts at" phrasing,
 * cost multipliers, or a range of numbers. Used on:
 *  - the agent's lines in every transcript (post-call; a hit flags the call)
 *  - every email before it is sent (a hit blocks the send)
 *  - the agent prompt and fixed copy (in tests; a hit fails the build)
 *
 * Plain numbers that are not money are allowed: phone digits, times,
 * dates, BHK counts, carpet area ("1,400 sq ft"), weeks and minutes.
 */

export interface PriceLeak { rule: string; match: string }

const RULES: { rule: string; re: RegExp }[] = [
  { rule: "currency_symbol", re: /[₹$€£]\s*\d|₹|\bINR\b|\bUSD\b/gi },
  { rule: "rupee_word", re: /\b(rs\.?|rupees?|rupaye|rupaiye)(?=[\s\d]|$)/gi },
  { rule: "money_unit", re: /\b\d[\d,.]*\s*(lakhs?|lacs?|lakh|l|crores?|cr|k)\b/gi },
  { rule: "money_unit_word", re: /\b(lakhs?|lacs|crores?|hazaar|hazar)\b/gi },
  { rule: "per_area_rate", re: /\bper\s*(sq\.?\s*(ft|feet|foot|m|metre|meter)|square\s*(feet|foot|metres?|meters?)|sqft|sft)\b/gi },
  { rule: "starts_at", re: /\b(starts?|starting)\s+(at|from)\b|\brates?\s+start\b/gi },
  { rule: "money_word_with_number", re: /\b(costs?|costing|price[sd]?|pricing|budget|rates?|charges?|fees?|ballpark|quote)\b[^.?!\n]{0,40}?\d/gi },
  { rule: "cost_multiplier", re: /\b\d+(\.\d+)?\s*(x|×|times)\s+(the\s+)?(cost|price|budget)\b/gi },
  {
    rule: "numeric_range",
    re: /(?<![\d\-/:])\b\d[\d,.]*\s*(?:-|–|—|to)\s*\d[\d,.]*\b(?![-/]\d)(?!\s*(?:am|pm|a\.m|p\.m|:\d|weeks?|days?|months?|years?|bhk|rooms?|minutes?|mins?|hours?|hrs?|people|persons?|seats?|floors?|th|st|nd|rd))/gi,
  },
];

export function findPriceLeaks(text: string | null | undefined): PriceLeak[] {
  if (!text) return [];
  const out: PriceLeak[] = [];
  for (const { rule, re } of RULES) {
    for (const m of text.matchAll(re)) out.push({ rule, match: m[0].trim() });
  }
  return out;
}

export function assertNoPriceLeak(text: string, where: string): void {
  const leaks = findPriceLeaks(text);
  if (leaks.length) throw new PriceLeakError(where, leaks);
}

export class PriceLeakError extends Error {
  constructor(public where: string, public leaks: PriceLeak[]) {
    super(`Price-like content blocked in ${where}: ${leaks.map((l) => `${l.rule}("${l.match}")`).join(", ")}`);
  }
}

/** Agent lines only, from a "Speaker: text" transcript. */
export function agentLines(transcript: string): string[] {
  return transcript.split("\n").filter((l) => /^(agent|assistant|bot|ai)\s*:/i.test(l)).map((l) => l.replace(/^[^:]+:\s*/, ""));
}
