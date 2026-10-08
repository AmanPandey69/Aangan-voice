import { randomUUID } from "node:crypto";
import { hmacHex, safeEqual } from "@/lib/security/hmac";
import type { EmailWebhookEvent, Notifier, OutboundEmail } from "./types";

export class MockNotifier implements Notifier {
  readonly name = "mock";
  static outbox: (OutboundEmail & { providerId: string })[] = [];
  static failNext = false;
  constructor(private secret: string) {}
  async send(email: OutboundEmail) {
    if (MockNotifier.failNext) { MockNotifier.failNext = false; throw new Error("mock email failure"); }
    const providerId = `mock-email-${randomUUID().slice(0, 8)}`;
    MockNotifier.outbox.push({ ...email, providerId });
    return { providerId };
  }
  verifyWebhook(rawBody: string, headers: Headers) { return safeEqual(headers.get("x-mock-signature"), hmacHex(this.secret, rawBody)); }
  parseWebhook(payload: unknown): EmailWebhookEvent | null {
    const p = payload as { type?: string; created_at?: string; data?: { email_id?: string } };
    if (!p?.data?.email_id || !p.type) return null;
    const t = p.type.replace("email.", "").replace("delivery_delayed", "delayed") as EmailWebhookEvent["type"];
    return { providerId: p.data.email_id, type: t, at: p.created_at ?? new Date().toISOString(), eventId: `${p.type}:${p.data.email_id}:${p.created_at}` };
  }
}
