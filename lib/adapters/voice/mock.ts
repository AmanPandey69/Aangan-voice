import { hmacHex, safeEqual } from "@/lib/security/hmac";
import type { NormalizedCall, VoiceProvider } from "./types";

/**
 * Mock voice provider used locally, in tests and by the smoke test.
 * Webhook body: { event_id, event: "call.ended", call: {...NormalizedCall fields} }
 * Signature: header `x-mock-signature` = hex HMAC-SHA256(secret, rawBody).
 * Tool requests: header `x-tool-secret` = secret; body { call_id, caller_phone, args }.
 */
export class MockVoice implements VoiceProvider {
  readonly name = "mock";
  constructor(private secret: string) {}

  sign(rawBody: string) { return hmacHex(this.secret, rawBody); }

  verifyWebhook(rawBody: string, headers: Headers) {
    return safeEqual(headers.get("x-mock-signature"), this.sign(rawBody));
  }

  parseWebhook(payload: unknown): NormalizedCall | null {
    const p = payload as { event_id?: string; event?: string; call?: Partial<NormalizedCall> & { turns?: { speaker: string; text: string }[] } };
    if (p?.event !== "call.ended" || !p.call?.providerCallId) return null;
    const c = p.call;
    const transcript = c.transcript ?? (c.turns ?? []).map((t) => `${t.speaker === "agent" ? "Agent" : "Caller"}: ${t.text}`).join("\n");
    return {
      providerCallId: c.providerCallId!, eventId: p.event_id ?? c.providerCallId!, eventType: p.event,
      callerPhone: c.callerPhone ?? null, startedAt: c.startedAt ?? null, endedAt: c.endedAt ?? null,
      durationSec: c.durationSec ?? 0, status: c.status ?? "completed", transcript,
      recordingUrl: c.recordingUrl ?? null, ringSec: c.ringSec ?? null, costUsd: c.costUsd ?? null,
    };
  }

  verifyToolRequest(_raw: string, headers: Headers) {
    return safeEqual(headers.get("x-tool-secret"), this.secret);
  }
  parseToolRequest(body: unknown) {
    const b = (body ?? {}) as { call_id?: string; caller_phone?: string; args?: Record<string, unknown> };
    return { callId: b.call_id ?? null, callerPhone: b.caller_phone ?? null, args: b.args ?? {} };
  }
  toolResponse(result: Record<string, unknown>) { return result; }
}
