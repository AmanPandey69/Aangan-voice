import type { LeadFacts } from "@/lib/domain/lead";

export interface ExtractionInput {
  transcript: string;
  /** ISO timestamp of the call, so "by March" resolves to a date. */
  callStartedAt: string;
  callerPhone: string | null;
  callId: string;
}

export interface ExtractionUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LLMProvider {
  readonly name: string;
  extractLead(input: ExtractionInput): Promise<{ raw: unknown; usage: ExtractionUsage }>;
}

export type { LeadFacts };
