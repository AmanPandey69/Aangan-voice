import { LeadFactsSchema, type LeadFacts } from "@/lib/domain/lead";
import type { ExtractionInput, ExtractionUsage, LLMProvider } from "@/lib/adapters/llm/types";
import { findPriceLeaks } from "@/lib/guard/price-guard";

export type ExtractionResult =
  | { ok: true; facts: LeadFacts; attempts: number; usage: ExtractionUsage[] }
  | { ok: false; error: string; attempts: number; usage: ExtractionUsage[]; lastRaw: unknown };

/**
 * Transcript → validated LeadFacts. Retries once on an LLM error or a
 * schema failure, then returns ok:false so the caller can flag the call
 * for manual review instead of guessing.
 */
export async function extractLead(llm: LLMProvider, input: ExtractionInput, maxAttempts = 2): Promise<ExtractionResult> {
  const usage: ExtractionUsage[] = [];
  let lastError = "";
  let lastRaw: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { raw, usage: u } = await llm.extractLead(input);
      usage.push(u);
      lastRaw = raw;
      const parsed = LeadFactsSchema.safeParse(raw);
      if (!parsed.success) {
        lastError = `schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
        continue;
      }
      const facts = normalise(parsed.data, input);
      return { ok: true, facts, attempts: attempt, usage };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, error: lastError, attempts: maxAttempts, usage, lastRaw };
}

function normalise(f: LeadFacts, input: ExtractionInput): LeadFacts {
  const out = { ...f };
  // Caller ID is more reliable than a number read out on the call.
  if (!out.phone && input.callerPhone) out.phone = input.callerPhone;
  // Free-text the LLM writes must never carry a money figure into storage or email.
  if (findPriceLeaks(out.summary).length) out.summary = "Summary withheld: contained a price-like figure. See transcript.";
  // budget_raw is only kept if the caller volunteered it.
  if (!out.budget_volunteered) { out.budget_raw = null; out.budget_concern = false; }
  return out;
}
