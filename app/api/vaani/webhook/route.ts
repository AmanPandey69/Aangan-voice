import { after } from "next/server";
import { services } from "@/lib/container";
import { drainJobs } from "@/lib/pipeline/jobs";
import { json, logError, parseJson } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Hobby plan: keep well inside the function duration limit. The heavy work runs
// in after(); anything unfinished stays queued for /api/jobs/retry.
export const maxDuration = 60;

/**
 * End-of-call webhook from the voice provider.
 * Verify signature → store raw payload → queue processing → respond.
 */
export async function POST(req: Request) {
  const s = services();
  const raw = await req.text();
  if (!s.voice.verifyWebhook(raw, req.headers)) return json({ error: "invalid signature" }, 401);

  const payload = parseJson(raw);
  if (payload === undefined) return json({ error: "invalid json" }, 400);

  const call = s.voice.parseWebhook(payload);
  const { row, duplicate } = await s.repo.saveWebhookEvent({
    source: "vaani", event_type: call?.eventType ?? (payload as { event?: string })?.event ?? null,
    external_id: call?.eventId ?? null, payload, signature_valid: true,
  });
  if (!call) {
    await s.repo.markWebhookProcessed(row.id, "ignored event");
    return json({ ok: true, ignored: true });
  }
  if (duplicate) return json({ ok: true, duplicate: true });

  await s.repo.enqueueJob("process_call", { webhookEventId: row.id });
  after(async () => {
    try { await drainJobs(s); } catch (err) { logError("vaani.after", err, { event: row.id }); }
  });
  return json({ ok: true, queued: true });
}
