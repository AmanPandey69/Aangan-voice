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
}

export interface VoiceProvider {
  readonly name: string;
  /** Verify the end-of-call webhook signature over the raw body. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  /** Returns null for events we don't process (e.g. call started). */
  parseWebhook(payload: unknown): NormalizedCall | null;
  /** Authenticate a mid-call tool request from the agent. */
  verifyToolRequest(rawBody: string, headers: Headers): boolean;
  /** Pull our tool arguments and the call context out of a tool request body. */
  parseToolRequest(body: unknown): { callId: string | null; callerPhone: string | null; args: Record<string, unknown> };
  /** Wrap a tool result in whatever envelope the provider expects. */
  toolResponse(result: Record<string, unknown>, body: unknown): unknown;
}
