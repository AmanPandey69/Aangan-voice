import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LeadFactsSchema } from "@/lib/domain/lead";
import { COSTS } from "@/config/costs";
import { EXTRACTION_SYSTEM, extractionUserMessage } from "@/lib/extraction/prompt";
import type { ExtractionInput, LLMProvider } from "./types";

/**
 * Google Gemini via @google/genai. Structured output uses `responseJsonSchema`
 * (a JSON Schema subset). The reply is still validated with zod in
 * extractLead(), which retries once and then flags the call.
 * Models and prices: https://ai.google.dev/gemini-api/docs/pricing (checked 2026-10-08).
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** JSON Schema keywords Gemini's responseJsonSchema accepts; everything else is dropped. */
const ALLOWED = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum", "items", "prefixItems",
  "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf", "properties", "additionalProperties", "required",
]);

export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!ALLOWED.has(k)) continue;
    // properties/$defs are maps of name → schema; recurse into the values, keep the names.
    out[k] = k === "properties" || k === "$defs"
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([n, s]) => [n, toGeminiSchema(s)]))
      : toGeminiSchema(v);
  }
  return out;
}

export const LEAD_FACTS_JSON_SCHEMA = toGeminiSchema(z.toJSONSchema(LeadFactsSchema));

export class GeminiLLM implements LLMProvider {
  readonly name = "gemini";
  private ai: GoogleGenAI;
  constructor(apiKey: string, private model = process.env.LLM_MODEL || DEFAULT_GEMINI_MODEL) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async extractLead(input: ExtractionInput) {
    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: extractionUserMessage(input.transcript, input.callStartedAt, input.callerPhone),
      config: {
        systemInstruction: EXTRACTION_SYSTEM,
        responseMimeType: "application/json",
        responseJsonSchema: LEAD_FACTS_JSON_SCHEMA,
        temperature: 0,
        abortSignal: AbortSignal.timeout(60_000),
      },
    });
    const text = res.text;
    if (!text) throw new Error(`gemini returned no text (finish: ${res.candidates?.[0]?.finishReason ?? "unknown"})`);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { throw new Error("gemini returned invalid JSON"); }

    const u = res.usageMetadata ?? {};
    const inputTokens = u.promptTokenCount ?? 0;
    // Thinking tokens are billed as output.
    const outputTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    const costUsd = (inputTokens * COSTS.llmInputUsdPerMTok + outputTokens * COSTS.llmOutputUsdPerMTok) / 1_000_000;
    return { raw, usage: { model: res.modelVersion ?? this.model, inputTokens, outputTokens, costUsd } };
  }
}
