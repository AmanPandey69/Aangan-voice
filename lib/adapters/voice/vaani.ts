import { hmacHex, safeEqual } from "@/lib/security/hmac";
import type { CallStatus } from "@/lib/db/types";
import type { NormalizedCall, VoiceProvider } from "./types";

/**
 * Vaani (app.vaanivoice.ai) adapter. Sources, checked 2026-10-08:
 *  - Events & payloads:  https://docs.vaanivoice.ai/guides/webhook-setup
 *  - Signature & retries: https://docs.vaanivoice.ai/api-reference/campaigns/webhooks
 *  - Call history (caller number, cost): https://docs.vaanivoice.ai/api-reference/call-history
 *
 * Event flow for an inbound call: call_started → call_ended → call_postprocessing.
 * Only call_postprocessing carries the transcript, so that is the one we process.
 * The caller's number is on call_started (stored then), with a call-history
 * API lookup as fallback.
 */

const API = "https://api.vaanivoice.ai";
const REPLAY_WINDOW_SEC = 300;

interface VaaniEvent {
  event?: string;
  call_id?: string;
  room_name?: string;
  timestamp?: string;
  phone_number?: string;
  call_duration?: number;
  end_reason?: string;
  data?: {
    room_name?: string;
    call_id?: string;
    call_duration?: number; // milliseconds in call_postprocessing
    end_reason?: string;
    summary?: string;
    entities?: Record<string, unknown> | null;
    dispositions?: Record<string, unknown> | null;
    recording_url?: string;
    transcript?: string;
  };
}

export class VaaniVoice implements VoiceProvider {
  readonly name = "vaani";
  constructor(private apiKey: string | undefined, private secret: string) {}

  /**
   * Documented scheme: X-Vaani-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${body}`)>,
   * X-Vaani-Timestamp within 5 minutes.
   * TODO(vaani): the docs show this on the campaign-webhook page; confirm the dashboard
   * (Settings → Webhooks) webhooks are signed the same way and where the secret is shown.
   * Until then a `?token=<VAANI_WEBHOOK_SECRET>` on the webhook URL is also accepted.
   */
  verifyWebhook(rawBody: string, headers: Headers, url?: string): boolean {
    // The URL token is as secret as the signing key, so either one is enough.
    if (url && safeEqual(new URL(url).searchParams.get("token"), this.secret)) return true;
    const sig = headers.get("x-vaani-signature");
    const ts = headers.get("x-vaani-timestamp");
    if (!sig || !ts || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > REPLAY_WINDOW_SEC) return false;
    return safeEqual(sig, `sha256=${hmacHex(this.secret, `${ts}.${rawBody}`)}`);
  }

  parseCallStart(payload: unknown): { providerCallId: string; callerPhone: string | null } | null {
    const p = payload as VaaniEvent;
    if (p?.event !== "call_started" || !p.room_name) return null;
    return { providerCallId: p.room_name, callerPhone: p.phone_number ?? null };
  }

  parseWebhook(payload: unknown): NormalizedCall | null {
    const p = payload as VaaniEvent;
    if (p?.event !== "call_postprocessing" || !p.data) return null;
    const id = p.data.call_id ?? p.call_id ?? p.data.room_name;
    if (!id) return null;
    const durationSec = Math.round((p.data.call_duration ?? 0) / 1000);
    const transcript = normaliseTranscript(p.data.transcript ?? "");
    const endedAt = p.timestamp ?? null;
    return {
      providerCallId: id,
      eventId: `call_postprocessing:${id}`,
      eventType: p.event,
      callerPhone: null, // filled by enrich()
      startedAt: endedAt ? new Date(Date.parse(endedAt) - durationSec * 1000).toISOString() : null,
      endedAt,
      durationSec,
      status: statusFrom(p.data.end_reason, transcript),
      transcript,
      recordingUrl: p.data.recording_url ?? null,
      ringSec: null,
      costUsd: null,
      liveVerdict: liveVerdictFrom(p.data.dispositions, p.data.entities),
    };
  }

  /** Fill in the caller number, real start time and cost from the call-history API. */
  async enrich(call: NormalizedCall): Promise<NormalizedCall> {
    if (!this.apiKey || (call.callerPhone && call.costUsd != null)) return call;
    try {
      for (let page = 1; page <= 3; page++) {
        const res = await fetch(`${API}/api/call-history?page=${page}&page_size=50`, {
          headers: { "X-API-Key": this.apiKey }, signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) break;
        const body = (await res.json()) as { data?: VaaniHistoryRow[]; pagination?: { has_next?: boolean } };
        const row = body.data?.find((r) => r.call_id === call.providerCallId);
        if (row) {
          const inbound = /^(inbound|incoming)$/i.test(row.direction ?? row.call_type ?? "");
          const creditUsd = Number(process.env.VAANI_USD_PER_CREDIT);
          return {
            ...call,
            callerPhone: call.callerPhone ?? (inbound ? row.from_number : row.to_number) ?? null,
            startedAt: row.Start_time ? asUtc(row.Start_time) : call.startedAt,
            endedAt: row.End_time ? asUtc(row.End_time) : call.endedAt,
            ringSec: row.call_ringing_at && row.user_picked_up_at
              ? Math.max(0, (Date.parse(asUtc(row.user_picked_up_at)) - Date.parse(asUtc(row.call_ringing_at))) / 1000) : call.ringSec,
            costUsd: row.call_cost != null && creditUsd > 0 ? row.call_cost * creditUsd : call.costUsd,
          };
        }
        if (!body.pagination?.has_next) break;
      }
    } catch { /* fall through: caller number may already be stored from call_started */ }
    return call;
  }

  /**
   * TODO(vaani): mid-call custom functions are not documented (agent config shows
   * `persona.actions.functions: []` with no schema). If you configure functions in
   * the Vaani dashboard, point them at /api/tools/* and add the header
   * `x-tool-secret: <VAANI_WEBHOOK_SECRET>` (or `Authorization: Bearer <secret>`).
   * Booking during the call can instead use Vaani's built-in Cal.com integration.
   */
  verifyToolRequest(_raw: string, headers: Headers): boolean {
    const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return safeEqual(headers.get("x-tool-secret"), this.secret) || safeEqual(bearer, this.secret);
  }

  parseToolRequest(body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    const args = (b.args ?? b.arguments ?? b.parameters ?? b) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    return {
      callId: str(b.call_id) ?? str(b.room_name) ?? str(args.call_id),
      callerPhone: str(b.caller_phone) ?? str(b.phone_number) ?? str(args.caller_phone),
      args,
    };
  }

  toolResponse(result: Record<string, unknown>) { return result; }
}

interface VaaniHistoryRow {
  call_id: string;
  call_type?: string;
  direction?: string;
  from_number?: string;
  to_number?: string;
  Start_time?: string;
  End_time?: string;
  call_cost?: number;
  call_ringing_at?: string;
  user_picked_up_at?: string;
}

/** History timestamps have no zone suffix; the examples are UTC. TODO(vaani): confirm. */
function asUtc(ts: string): string {
  return /[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? new Date(ts).toISOString() : new Date(`${ts}Z`).toISOString();
}

/** "[13:33:14] AGENT: hi\n\n[13:33:19] USER: hello" → "Agent: hi\nCaller: hello" */
export function normaliseTranscript(raw: string): string {
  return raw.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^\[[\d:]+\]\s*/, ""))
    .map((l) => l.replace(/^AGENT\s*:/i, "Agent:").replace(/^(USER|CUSTOMER|CALLER)\s*:/i, "Caller:"))
    .filter((l) => /^(Agent|Caller):/.test(l)).join("\n");
}

function statusFrom(endReason: string | undefined, transcript: string): CallStatus {
  if (!/^Caller:/m.test(transcript)) return "missed";
  if (endReason && /error|fail|drop|disconnect(ed)? unexpectedly/i.test(endReason)) return "dropped";
  return "completed";
}

/**
 * Live verdict, if the agent's Analysis section defines a disposition or entity
 * named "qualification" with values qualified / declined / escalate.
 */
function liveVerdictFrom(...sources: (Record<string, unknown> | null | undefined)[]): string | null {
  for (const src of sources) {
    if (!src) continue;
    const v = Object.entries(src).find(([k]) => /qualif|verdict/i.test(k))?.[1];
    const s = typeof v === "string" ? v.toLowerCase() : "";
    if (/escalat/.test(s)) return "escalate";
    if (/declin|not.?qualif|unqualif/.test(s)) return "declined";
    if (/qualif/.test(s)) return "qualified";
  }
  return null;
}
