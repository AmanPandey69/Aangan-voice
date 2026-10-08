import type { CallStatus } from "@/lib/db/types";

/** Provider-neutral view of a finished call. */
export interface NormalizedCall {
  providerCallId: string;
  /** Unique id of the webhook delivery, for idempotency. Falls back to the call id. */
  eventId: string;
  eventType: string;
  callerPhone: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  status: CallStatus;
  /** "Agent: ...\nCaller: ..." lines. */
  transcript: string;
  recordingUrl: string | null;
  /** Seconds the call rang before the agent answered, if reported. */
  ringSec: number | null;
  /** Provider-reported cost of the call in USD, if any. */
  costUsd: number | null;
  /** Verdict the agent reached during the call, if the provider reports one. */
  liveVerdict?: string | null;
}

export interface VoiceProvider {
  readonly name: string;
  /** Verify the webhook signature over the raw body (url: for providers that use a URL token). */
  verifyWebhook(rawBody: string, headers: Headers, url?: string): boolean;
  /** Early "call started" event carrying the caller's number, if the provider sends one. */
  parseCallStart?(payload: unknown): { providerCallId: string; callerPhone: string | null } | null;
  /** Fill in fields the end-of-call event lacks (caller number, cost) from the provider API. */
  enrich?(call: NormalizedCall): Promise<NormalizedCall>;
  /** Returns null for events we don't process (e.g. call started). */
  parseWebhook(payload: unknown): NormalizedCall | null;
  /** Authenticate a mid-call tool request from the agent. */
  verifyToolRequest(rawBody: string, headers: Headers): boolean;
  /** Pull our tool arguments and the call context out of a tool request body. */
  parseToolRequest(body: unknown): { callId: string | null; callerPhone: string | null; args: Record<string, unknown> };
  /** Wrap a tool result in whatever envelope the provider expects. */
  toolResponse(result: Record<string, unknown>, body: unknown): unknown;
}
