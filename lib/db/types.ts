import type { CriterionKey, CriterionResult, Flag, LeadFacts, Verdict } from "@/lib/domain/lead";

export type BookingStatus = "none" | "booked" | "needs_manual_booking" | "not_offered" | "cancelled";
export type CallStatus = "completed" | "dropped" | "missed" | "failed";
export type NotificationKind = "handoff" | "urgent" | "manual_booking" | "reminder";
export type NotificationStatus = "queued" | "sent" | "delivered" | "delayed" | "bounced" | "complained" | "failed" | "blocked";
export type ReviewReason =
  | "declined" | "unclear" | "verdict_mismatch" | "small_commercial" | "needs_manual_booking"
  | "unacknowledged_handoff" | "extraction_failed" | "price_leak" | "budget_review" | "escalation"
  | "unknown_locality" | "missed_call";

export interface LeadRow {
  id: string;
  phone: string;
  channel: string;
  name: string | null;
  email: string | null;
  locality: string | null;
  facts: Partial<LeadFacts>;
  verdict: Verdict | null;
  urgent: boolean;
  reason: string | null;
  criteria: Record<CriterionKey, CriterionResult> | null;
  flags: Flag[];
  uncertainties: string[];
  live_verdict: string | null;
  verdict_mismatch: boolean;
  price_leak: boolean;
  booking_status: BookingStatus;
  booked_slot: string | null;
  preferred_time_raw: string | null;
  hubspot_contact_id: string | null;
  hubspot_deal_id: string | null;
  review_reasons: ReviewReason[];
  review_resolved_at: string | null;
  extraction_failed: boolean;
  first_seen_at: string;
  last_call_at: string;
  created_at: string;
  updated_at: string;
}

export interface CallRow {
  id: string;
  provider_call_id: string;
  lead_id: string | null;
  channel: string;
  caller_phone: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number;
  status: CallStatus;
  transcript: string | null;
  recording_url: string | null;
  live_verdict: string | null;
  ring_sec: number | null;
  voice_cost_usd: number;
  llm_cost_usd: number;
  llm_input_tokens: number;
  llm_output_tokens: number;
  extraction_status: "pending" | "ok" | "failed" | "skipped";
  webhook_event_id: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface WebhookEventRow {
  id: string;
  source: "vaani" | "calcom" | "resend";
  event_type: string | null;
  external_id: string | null;
  payload: unknown;
  signature_valid: boolean;
  received_at: string;
  processed_at: string | null;
  error: string | null;
}

export interface BookingRow {
  id: string;
  lead_id: string | null;
  provider: string;
  provider_booking_id: string;
  start_at: string;
  end_at: string | null;
  status: string;
  attendee_email: string | null;
  attendee_phone: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  lead_id: string | null;
  kind: NotificationKind;
  recipient: string;
  cc: string | null;
  subject: string;
  provider: string;
  provider_id: string | null;
  status: NotificationStatus;
  error: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  reminder_sent_at: string | null;
  flagged_unacknowledged_at: string | null;
  created_at: string;
}

export interface JobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  max_attempts: number;
  run_after: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeadLetterRow {
  id: string;
  job_id: string | null;
  kind: string;
  payload: unknown;
  error: string | null;
  attempts: number;
  created_at: string;
}

export interface LeadFilter {
  verdict?: Verdict;
  booking_status?: BookingStatus;
  needsReview?: boolean;
  search?: string;
  since?: string;
  limit?: number;
}

type Insert<T, Optional extends keyof T> = Omit<T, "id" | "created_at" | Optional> & Partial<Pick<T, Optional>>;
export type NewLead = Insert<LeadRow, "updated_at" | "first_seen_at" | "last_call_at">;
export type NewCall = Insert<CallRow, never>;
export type NewNotification = Insert<NotificationRow, never>;
