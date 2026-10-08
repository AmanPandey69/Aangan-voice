import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LeadFactsSchema } from "@/lib/domain/lead";
import { COSTS } from "@/config/costs";
import { EXTRACTION_SYSTEM, extractionUserMessage } from "@/lib/extraction/prompt";
import type { ExtractionInput, LLMProvider } from "./types";

export class AnthropicLLM implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = process.env.LLM_MODEL || "claude-opus-5-5") {
    this.client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
    this.model = model;
  }

  async extractLead(input: ExtractionInput) {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      // Extraction is a simple task; low effort keeps per-call cost down.
      output_config: { effort: "low", format: betaZodOutputFormat(LeadFactsSchema) },
      // Server-side refusal fallback: re-runs on another model if a safety classifier declines.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: EXTRACTION_SYSTEM,
      messages: [{ role: "user", content: extractionUserMessage(input.transcript, input.callStartedAt, input.callerPhone) }],
    });

    if (response.stop_reason === "refusal") throw new Error("LLM refused extraction");
    if (response.stop_reason === "max_tokens") throw new Error("LLM extraction truncated");

    const inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
    const outputTokens = response.usage.output_tokens;
    const costUsd = (inputTokens * COSTS.llmInputUsdPerMTok + outputTokens * COSTS.llmOutputUsdPerMTok) / 1_000_000;
    return {
      raw: response.parsed_output,
      usage: { model: response.model, inputTokens, outputTokens, costUsd },
    };
  }
}
