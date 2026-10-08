import type {
  BookingRow, CallRow, DeadLetterRow, JobRow, LeadFilter, LeadRow, NewCall, NewLead,
  NewNotification, NotificationRow, WebhookEventRow,
} from "./types";

/**
 * Storage interface. `MemoryRepo` backs mock mode and tests;
 * `SupabaseRepo` backs production. Pipeline code depends only on this.
 */
export interface Repo {
  readonly kind: "memory" | "supabase";

  saveWebhookEvent(e: Omit<WebhookEventRow, "id" | "received_at" | "processed_at" | "error">): Promise<{ row: WebhookEventRow; duplicate: boolean }>;
  markWebhookProcessed(id: string, error?: string | null): Promise<void>;
  getWebhookEvent(id: string): Promise<WebhookEventRow | null>;

  upsertCall(c: NewCall): Promise<CallRow>;
  updateCall(id: string, patch: Partial<CallRow>): Promise<CallRow>;
  getCall(id: string): Promise<CallRow | null>;
  getCallByProviderId(providerCallId: string): Promise<CallRow | null>;
  listCallsForLead(leadId: string): Promise<CallRow[]>;
  listCalls(opts?: { since?: string; limit?: number }): Promise<CallRow[]>;

  findLeadByPhone(phone: string, channel?: string): Promise<LeadRow | null>;
  insertLead(l: NewLead): Promise<LeadRow>;
  updateLead(id: string, patch: Partial<LeadRow>): Promise<LeadRow>;
  getLead(id: string): Promise<LeadRow | null>;
  listLeads(f?: LeadFilter): Promise<LeadRow[]>;

  upsertBooking(b: Omit<BookingRow, "id" | "created_at">): Promise<BookingRow>;
  listBookingsForLead(leadId: string): Promise<BookingRow[]>;

  insertNotification(n: NewNotification): Promise<NotificationRow>;
  updateNotification(id: string, patch: Partial<NotificationRow>): Promise<NotificationRow>;
  getNotification(id: string): Promise<NotificationRow | null>;
  findNotificationByProviderId(providerId: string): Promise<NotificationRow | null>;
  listNotifications(opts?: { leadId?: string; since?: string }): Promise<NotificationRow[]>;
  /** Sent handoff/urgent emails with no acknowledgement, sent before `before`. */
  listUnacknowledged(before: string): Promise<NotificationRow[]>;

  enqueueJob(kind: string, payload: Record<string, unknown>, opts?: { runAfter?: string; maxAttempts?: number }): Promise<JobRow>;
  claimDueJobs(limit: number): Promise<JobRow[]>;
  completeJob(id: string): Promise<void>;
  /** Reschedules with backoff, or dead-letters once attempts are exhausted. */
  failJob(job: JobRow, error: string): Promise<"retry" | "dead">;
  listDeadLetters(limit?: number): Promise<DeadLetterRow[]>;
  listJobs(status?: JobRow["status"]): Promise<JobRow[]>;
}

export function backoffMs(attempts: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1));
}
