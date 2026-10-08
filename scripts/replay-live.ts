/**
 * Replays T01–T20 through the REAL LLM extractor and the rules engine,
 * and reports where the verdict or key fields differ from the labelled
 * fixtures. Costs real money (about 19 extraction calls).
 *
 *   LLM_API_KEY=... npm run replay:live          (Gemini; LLM_PROVIDER=anthropic for Claude)
 */
import { loadFixtures, transcriptText } from "../fixtures/load";
import { AnthropicLLM } from "../lib/adapters/llm/anthropic";
import { GeminiLLM } from "../lib/adapters/llm/gemini";
import { extractLead } from "../lib/extraction/extract";
import { evaluate } from "../lib/rules/engine";

const KEY_FIELDS = ["locality", "scope_type", "wants_execution", "completion_by", "decision_maker", "price_asked", "budget_concern", "existing_client_complaint", "requested_human"] as const;

async function main() {
  const key = process.env.LLM_API_KEY;
  if (!key) { console.error("Set LLM_API_KEY to run the live replay."); process.exit(1); }
  const llm = process.env.LLM_PROVIDER === "anthropic" ? new AnthropicLLM(key) : new GeminiLLM(key);
  let mismatches = 0, cost = 0;

  for (const fx of loadFixtures()) {
    if (fx.expected === "missed") { console.log(`${fx.id}  missed call (skipped)`); continue; }
    const call = fx.calls[fx.calls.length - 1];
    const transcript = fx.calls.map(transcriptText).join("\n");
    const r = await extractLead(llm, { transcript, callStartedAt: call.started_at, callerPhone: fx.caller_phone, callId: call.call_id });
    cost += r.usage.reduce((s, u) => s + u.costUsd, 0);
    if (!r.ok) { mismatches++; console.log(`${fx.id}  EXTRACTION FAILED: ${r.error}`); continue; }
    const verdict = evaluate(r.facts, { now: new Date(call.started_at) }).verdict;
    const diffs = KEY_FIELDS.filter((k) => JSON.stringify(r.facts[k]) !== JSON.stringify(fx.facts![k]))
      .map((k) => `${k}: got ${JSON.stringify(r.facts[k])} want ${JSON.stringify(fx.facts![k])}`);
    const ok = verdict === fx.expected;
    if (!ok) mismatches++;
    console.log(`${fx.id}  ${ok ? "ok  " : "MISS"} ${verdict.padEnd(9)} (want ${fx.expected})${diffs.length ? "\n      " + diffs.join("\n      ") : ""}`);
  }
  console.log(`\nverdict mismatches: ${mismatches}   LLM cost: $${cost.toFixed(4)}`);
  process.exit(mismatches ? 1 : 0);
}
main();
