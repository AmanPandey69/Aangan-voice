import { after } from "next/server";
import { services } from "@/lib/container";
import { runMaintenance } from "@/lib/pipeline/jobs";
import { json, logError, parseJson } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vaani times out after 5 s, so we answer immediately. The heavy work runs in
// after(); anything unfinished stays queued for /api/jobs/retry.
export const maxDuration = 60;

/**
 * Call webhooks from the voice provider.
 * Verify signature → store raw payload → (call start: remember caller number)
 * (end of call: queue processing) → respond.
 */
export async function POST(req: Request) {
  const s = services();
  const raw = await req.text();
  if (!s.voice.verifyWebhook(raw, req.headers, req.url)) return json({ error: "invalid signature" }, 401);

  const payload = parseJson(raw);
  if (payload === undefined) return json({ error: "invalid json" }, 400);

  const start = s.voice.parseCallStart?.(payload) ?? null;
  const call = start ? null : s.voice.parseWebhook(payload);
  const { row, duplicate } = await s.repo.saveWebhookEvent({
    source: "vaani",
    event_type: call?.eventType ?? (payload as { event?: string })?.event ?? null,
    external_id: call?.eventId ?? (start ? `call_started:${start.providerCallId}` : null),
    payload, signature_valid: true,
  });
  if (duplicate) return json({ ok: true, duplicate: true });

  if (start) {
    // Remember the caller's number; the transcript arrives in a later event.
    const existing = await s.repo.getCallByProviderId(start.providerCallId);
    if (existing) await s.repo.updateCall(existing.id, { caller_phone: existing.caller_phone ?? start.callerPhone });
    else await s.repo.upsertCall({
      provider_call_id: start.providerCallId, lead_id: null, channel: "phone", caller_phone: start.callerPhone,
      started_at: new Date().toISOString(), ended_at: null, duration_sec: 0, status: "in_progress", transcript: null,
      recording_url: null, live_verdict: null, ring_sec: null, voice_cost_usd: 0, llm_cost_usd: 0, llm_input_tokens: 0,
      llm_output_tokens: 0, extraction_status: "pending", webhook_event_id: row.id, processed_at: null,
    });
    await s.repo.markWebhookProcessed(row.id);
    return json({ ok: true });
  }

  if (!call) {
    await s.repo.markWebhookProcessed(row.id, "ignored event");
    return json({ ok: true, ignored: true });
  }

  await s.repo.enqueueJob("process_call", { webhookEventId: row.id });
  after(async () => {
    try { await runMaintenance(s); } catch (err) { logError("vaani.after", err, { event: row.id }); }
  });
  return json({ ok: true, queued: true });
}
