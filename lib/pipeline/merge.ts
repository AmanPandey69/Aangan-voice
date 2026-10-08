import { emptyFacts, type LeadFacts } from "@/lib/domain/lead";

/**
 * Merge facts from a new call into a lead's existing facts (redial, or a
 * second call days later). A stated value in the new call wins; a null
 * never erases something said earlier. Booleans that only ever become
 * true (price asked, complaint, ...) are OR-ed.
 */
const STICKY_TRUE: (keyof LeadFacts)[] = [
  "price_asked", "budget_volunteered", "budget_concern", "existing_client_complaint",
  "requested_human", "abusive", "frustrated",
];

export function mergeFacts(prev: Partial<LeadFacts> | null | undefined, next: LeadFacts): LeadFacts {
  if (!prev || Object.keys(prev).length === 0) return next;
  const base = emptyFacts(prev as Partial<LeadFacts>);
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(next) as [keyof LeadFacts, unknown][]) {
    if (STICKY_TRUE.includes(k)) out[k] = Boolean(base[k]) || Boolean(v);
    else if (k === "scope_rooms") out[k] = Array.from(new Set([...(base.scope_rooms ?? []), ...(v as string[])]));
    else if (k === "decision_maker") out[k] = v === "unknown" ? base.decision_maker : v;
    else if (k === "misunderstood_count") out[k] = v; // per call, not cumulative
    else if (k === "summary") out[k] = (v as string) || base.summary;
    else if (v !== null && v !== undefined) out[k] = v;
  }
  return out as unknown as LeadFacts;
}
