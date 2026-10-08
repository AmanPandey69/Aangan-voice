import { describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent }; } }));

import { GeminiLLM, LEAD_FACTS_JSON_SCHEMA } from "@/lib/adapters/llm/gemini";
import { extractLead } from "@/lib/extraction/extract";
import { emptyFacts } from "@/lib/domain/lead";

const input = { transcript: "Caller: 2BHK in Baner", callStartedAt: "2026-10-08T10:00:00+05:30", callerPhone: "+919800000001", callId: "c1" };

describe("Gemini adapter", () => {
  it("schema keeps only keywords Gemini supports", () => {
    const s = JSON.stringify(LEAD_FACTS_JSON_SCHEMA);
    expect(s).not.toContain("$schema");
    expect(s).not.toContain("exclusiveMinimum");
    expect(s).toContain('"locality"');
    expect((LEAD_FACTS_JSON_SCHEMA as { required: string[] }).required).toContain("price_asked");
  });

  it("sends JSON mode + schema and returns validated facts with cost", async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify(emptyFacts({ locality: "Baner", summary: "2BHK" })), modelVersion: "gemini-3.8-flash",
      usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 100_000, thoughtsTokenCount: 100_000 },
    });
    const r = await extractLead(new GeminiLLM("key"), input);
    expect(r.ok && r.facts.locality).toBe("Baner");
    expect(r.usage[0].costUsd).toBeCloseTo(0.75 + 0.2 * 3.75);
    const req = generateContent.mock.calls[0][0];
    expect(req.model).toBe("gemini-3.8-flash");
    expect(req.config.responseMimeType).toBe("application/json");
    expect(req.config.responseJsonSchema).toBe(LEAD_FACTS_JSON_SCHEMA);
  });

  it("retries once on bad JSON, then flags", async () => {
    generateContent.mockResolvedValueOnce({ text: "not json" }).mockResolvedValueOnce({ text: undefined, candidates: [{ finishReason: "SAFETY" }] });
    const r = await extractLead(new GeminiLLM("key"), input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/SAFETY/);
  });
});
