import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/security/hmac";
import type { EmailWebhookEvent, Notifier, OutboundEmail } from "./types";

/**
 * Resend. Sources, checked 2026-10-08:
 *  - Send:        https://resend.com/docs/api-reference/emails/send-email
 *  - Idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys
 *  - Webhooks:    https://resend.com/docs/webhooks/event-types
 *  - Verify (Svix): https://resend.com/docs/webhooks/verify-webhooks-requests
 */
const TOLERANCE_SEC = 300;

export class ResendNotifier implements Notifier {
  readonly name = "resend";
  constructor(private apiKey: string, private from: string, private webhookSecret: string | undefined) {}

  async send(email: OutboundEmail) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": email.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: this.from, to: [email.to], ...(email.cc ? { cc: [email.cc] } : {}),
        subject: email.subject, html: email.html, text: email.text,
        tags: Object.entries(email.tags ?? {}).map(([name, value]) => ({ name, value: value.replace(/[^\w-]/g, "_") })),
      }),
    });
    if (!res.ok) {
      // 403 with the shared resend.dev sender means the recipient isn't the account owner: verify a domain.
      throw new Error(`resend ${res.status}${res.status === 403 ? " (verify your sending domain; resend.dev can only email the account owner)" : ""}`);
    }
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new Error("resend: no id in response");
    return { providerId: body.id };
  }

  /** Svix: base64 HMAC-SHA256 of `${svix-id}.${svix-timestamp}.${body}` keyed by the base64 part of whsec_… */
  verifyWebhook(rawBody: string, headers: Headers): boolean {
    if (!this.webhookSecret) return false;
    const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sigs = headers.get("svix-signature");
    if (!id || !ts || !sigs || !/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_SEC) return false;
    const key = Buffer.from(this.webhookSecret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
    return sigs.split(" ").some((part) => {
      const [version, sig] = part.split(",");
      return version === "v1" && safeEqual(sig, expected);
    });
  }

  parseWebhook(payload: unknown, headers: Headers): EmailWebhookEvent | null {
    const p = payload as { type?: string; created_at?: string; data?: { email_id?: string } };
    if (!p?.type?.startsWith("email.") || !p.data?.email_id) return null;
    const map: Record<string, EmailWebhookEvent["type"]> = {
      "email.sent": "sent", "email.delivered": "delivered", "email.delivery_delayed": "delayed",
      "email.bounced": "bounced", "email.complained": "complained", "email.opened": "opened", "email.failed": "failed",
    };
    return { providerId: p.data.email_id, type: map[p.type] ?? "other", at: p.created_at ?? new Date().toISOString(),
      eventId: headers.get("svix-id") ?? `${p.type}:${p.data.email_id}:${p.created_at}` };
  }
}
