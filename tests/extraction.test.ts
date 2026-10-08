import { describe, expect, it } from "vitest";
import { extractLead } from "@/lib/extraction/extract";
import { MockLLM, heuristicExtract } from "@/lib/adapters/llm/mock";
import type { LLMProvider } from "@/lib/adapters/llm/types";
import { emptyFacts } from "@/lib/domain/lead";
import { loadFixtures, transcriptText } from "@/fixtures/load";
import { evaluate } from "@/lib/rules/engine";
import { EXTRACTION_SYSTEM } from "@/lib/extraction/prompt";
import { findPriceLeaks } from "@/lib/guard/price-guard";

const input = { transcript: "Caller: hi", callStartedAt: "2026-10-08T10:00:00+05:30", callerPhone: "+919800000099", callId: "x" };
const usage = { model: "t", inputTokens: 1, outputTokens: 1, costUsd: 0.001 };

function scripted(responses: (unknown | Error)[]): LLMProvider {
  let i = 0;
  return { name: "scripted", async extractLead() {
    const r = responses[i++];
    if (r instanceof Error) throw r;
    return { raw: r, usage };
  } };
}

describe("extractLead", () => {
  it("returns validated facts", async () => {
    const r = await extractLead(scripted([emptyFacts({ locality: "Baner", summary: "ok" })]), input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts.phone).toBe("+919800000099");
  });

  it("retries once after a schema failure, then succeeds", async () => {
    const r = await extractLead(scripted([{ nope: true }, emptyFacts({ summary: "ok" })]), input);
    expect(r.ok && r.attempts).toBe(2);
  });

  it("retries once after an error, then flags", async () => {
    const r = await extractLead(scripted([new Error("boom"), { bad: 1 }]), input);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.attempts).toBe(2); expect(r.error).toMatch(/schema/); expect(r.usage).toHaveLength(1); }
  });

  it("strips a price-bearing summary and an unvolunteered budget", async () => {
    const r = await extractLead(scripted([emptyFacts({ summary: "Wants 2BHK for about 10 lakh", budget_raw: "x", budget_concern: true })]), input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(findPriceLeaks(r.facts.summary)).toEqual([]);
      expect(r.facts.budget_raw).toBeNull();
      expect(r.facts.budget_concern).toBe(false);
    }
  });

  it("the extraction prompt contains no price figures", () => expect(findPriceLeaks(EXTRACTION_SYSTEM)).toEqual([]));
});

describe("mock extractor (local mode only)", () => {
  it("returns canned facts when registered", async () => {
    MockLLM.register("c1", emptyFacts({ locality: "Wakad", summary: "s" }));
    const r = await extractLead(new MockLLM(), { ...input, callId: "c1" });
    expect(r.ok && r.facts.locality).toBe("Wakad");
    MockLLM.clear();
  });

  it("heuristics give a sensible verdict on clear-cut fixtures", () => {
    const by = Object.fromEntries(loadFixtures().map((f) => [f.id, f]));
    for (const [id, want] of [["T01", "qualified"], ["T03", "declined"], ["T09", "escalate"], ["T19", "declined"]] as const) {
      const call = by[id].calls[0];
      const facts = heuristicExtract({ transcript: transcriptText(call), callStartedAt: call.started_at, callerPhone: by[id].caller_phone, callId: call.call_id });
      expect(evaluate(facts, { now: new Date(call.started_at) }).verdict, id).toBe(want);
    }
  });
});
