import { services } from "@/lib/container";
import type { NotificationRow } from "@/lib/db/types";
import { json, parseJson } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delivery, bounce and open events → the notification row. */
export async function POST(req: Request) {
  const s = services();
  const raw = await req.text();
  if (!s.notifier.verifyWebhook(raw, req.headers)) return json({ error: "invalid signature" }, 401);
  const payload = parseJson(raw);
  if (payload === undefined) return json({ error: "invalid json" }, 400);

  const ev = s.notifier.parseWebhook(payload, req.headers);
  const { row, duplicate } = await s.repo.saveWebhookEvent({ source: "resend", event_type: ev?.type ?? null, external_id: ev?.eventId ?? null, payload, signature_valid: true });
  if (!ev || duplicate) return json({ ok: true });

  const n = await s.repo.findNotificationByProviderId(ev.providerId);
  if (n) {
    const patch: Partial<NotificationRow> =
      ev.type === "delivered" ? { status: "delivered", delivered_at: ev.at }
      : ev.type === "opened" ? { opened_at: n.opened_at ?? ev.at }
      : ev.type === "bounced" ? { status: "bounced", error: "bounced" }
      : ev.type === "complained" ? { status: "complained" }
      : ev.type === "delayed" ? { status: "delayed" }
      : ev.type === "failed" ? { status: "failed", error: "provider reported failure" }
      : {};
    if (Object.keys(patch).length) await s.repo.updateNotification(n.id, patch);
  }
  await s.repo.markWebhookProcessed(row.id, n ? null : "unknown email id");
  return json({ ok: true });
}
