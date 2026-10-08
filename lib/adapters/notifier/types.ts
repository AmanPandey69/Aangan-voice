export interface OutboundEmail {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  tags?: Record<string, string>;
}

export interface EmailWebhookEvent {
  providerId: string;
  type: "sent" | "delivered" | "delayed" | "bounced" | "complained" | "opened" | "failed" | "other";
  at: string;
  eventId: string;
}

export interface Notifier {
  readonly name: string;
  send(email: OutboundEmail): Promise<{ providerId: string }>;
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  parseWebhook(payload: unknown, headers: Headers): EmailWebhookEvent | null;
}
