import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { backoffMs, type Repo } from "./repo";
import type {
  BookingRow, CallRow, DeadLetterRow, JobRow, LeadFilter, LeadRow, NewCall, NewLead,
  NewNotification, NotificationRow, WebhookEventRow,
} from "./types";

/** Production store. Server-side only: uses the service-role key, which bypasses RLS. */
export class SupabaseRepo implements Repo {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private async one<T>(p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw new Error(`db: ${error.message}`);
    return data as T;
  }
  private async maybe<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T | null> {
    const { data, error } = await p;
    if (error) throw new Error(`db: ${error.message}`);
    return (data as T) ?? null;
  }

  async saveWebhookEvent(e: Omit<WebhookEventRow, "id" | "received_at" | "processed_at" | "error">) {
    const { data, error } = await this.db.from("webhook_events").insert(e).select().single();
    if (error?.code === "23505" && e.external_id) {
      const row = await this.one<WebhookEventRow>(this.db.from("webhook_events").select().eq("source", e.source).eq("external_id", e.external_id).single());
      return { row, duplicate: true };
    }
    if (error) throw new Error(`db: ${error.message}`);
    return { row: data as WebhookEventRow, duplicate: false };
  }
  async markWebhookProcessed(id: string, error: string | null = null) {
    await this.one(this.db.from("webhook_events").update({ processed_at: new Date().toISOString(), error }).eq("id", id));
  }
  async getWebhookEvent(id: string) { return this.maybe<WebhookEventRow>(this.db.from("webhook_events").select().eq("id", id).maybeSingle()); }

  async upsertCall(c: NewCall) {
    return this.one<CallRow>(this.db.from("calls").upsert(c, { onConflict: "provider_call_id" }).select().single());
  }
  async updateCall(id: string, patch: Partial<CallRow>) {
    return this.one<CallRow>(this.db.from("calls").update(patch).eq("id", id).select().single());
  }
  async getCall(id: string) { return this.maybe<CallRow>(this.db.from("calls").select().eq("id", id).maybeSingle()); }
  async getCallByProviderId(pid: string) { return this.maybe<CallRow>(this.db.from("calls").select().eq("provider_call_id", pid).maybeSingle()); }
  async listCallsForLead(leadId: string) {
    return this.one<CallRow[]>(this.db.from("calls").select().eq("lead_id", leadId).order("started_at", { ascending: false }));
  }
  async listCalls(opts: { since?: string; limit?: number } = {}) {
    let q = this.db.from("calls").select().order("started_at", { ascending: false }).limit(opts.limit ?? 500);
    if (opts.since) q = q.gte("started_at", opts.since);
    return this.one<CallRow[]>(q);
  }

  async findLeadByPhone(phone: string, channel = "phone") {
    return this.maybe<LeadRow>(this.db.from("leads").select().eq("phone", phone).eq("channel", channel).maybeSingle());
  }
  async insertLead(l: NewLead) { return this.one<LeadRow>(this.db.from("leads").insert(l).select().single()); }
  async updateLead(id: string, patch: Partial<LeadRow>) {
    return this.one<LeadRow>(this.db.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single());
  }
  async getLead(id: string) { return this.maybe<LeadRow>(this.db.from("leads").select().eq("id", id).maybeSingle()); }
  async listLeads(f: LeadFilter = {}) {
    let q = this.db.from("leads").select().order("last_call_at", { ascending: false }).limit(f.limit ?? 500);
    if (f.verdict) q = q.eq("verdict", f.verdict);
    if (f.booking_status) q = q.eq("booking_status", f.booking_status);
    if (f.since) q = q.gte("last_call_at", f.since);
    if (f.needsReview === true) q = q.neq("review_reasons", "{}").is("review_resolved_at", null);
    if (f.search) {
      const s = f.search.replace(/[%,()]/g, "");
      q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%,locality.ilike.%${s}%,email.ilike.%${s}%`);
    }
    return this.one<LeadRow[]>(q);
  }

  async upsertBooking(b: Omit<BookingRow, "id" | "created_at">) {
    return this.one<BookingRow>(this.db.from("bookings").upsert(b, { onConflict: "provider_booking_id" }).select().single());
  }
  async listBookingsForLead(leadId: string) { return this.one<BookingRow[]>(this.db.from("bookings").select().eq("lead_id", leadId)); }
  async findUnlinkedBookings(phone: string | null, email: string | null) {
    const ors = [phone ? `attendee_phone.eq.${phone}` : null, email ? `attendee_email.ilike.${email.replace(/[%,()]/g, "")}` : null].filter(Boolean);
    if (!ors.length) return [];
    return this.one<BookingRow[]>(this.db.from("bookings").select().is("lead_id", null).or(ors.join(",")));
  }
  async linkBooking(id: string, leadId: string) { await this.one(this.db.from("bookings").update({ lead_id: leadId }).eq("id", id)); }

  async insertNotification(n: NewNotification) { return this.one<NotificationRow>(this.db.from("notifications").insert(n).select().single()); }
  async updateNotification(id: string, patch: Partial<NotificationRow>) {
    return this.one<NotificationRow>(this.db.from("notifications").update(patch).eq("id", id).select().single());
  }
  async getNotification(id: string) { return this.maybe<NotificationRow>(this.db.from("notifications").select().eq("id", id).maybeSingle()); }
  async findNotificationByProviderId(pid: string) {
    return this.maybe<NotificationRow>(this.db.from("notifications").select().eq("provider_id", pid).maybeSingle());
  }
  async listNotifications(opts: { leadId?: string; since?: string } = {}) {
    let q = this.db.from("notifications").select().order("created_at", { ascending: false });
    if (opts.leadId) q = q.eq("lead_id", opts.leadId);
    if (opts.since) q = q.gte("created_at", opts.since);
    return this.one<NotificationRow[]>(q);
  }
  async listUnacknowledged(before: string) {
    return this.one<NotificationRow[]>(this.db.from("notifications").select()
      .in("kind", ["handoff", "urgent", "manual_booking"]).is("acknowledged_at", null)
      .in("status", ["sent", "delivered", "delayed"]).lte("sent_at", before));
  }

  async enqueueJob(kind: string, payload: Record<string, unknown>, opts: { runAfter?: string; maxAttempts?: number } = {}) {
    return this.one<JobRow>(this.db.from("jobs").insert({
      kind, payload, run_after: opts.runAfter ?? new Date().toISOString(), max_attempts: opts.maxAttempts ?? 5,
    }).select().single());
  }
  async claimDueJobs(limit: number) { return this.one<JobRow[]>(this.db.rpc("claim_jobs", { max_jobs: limit })); }
  async completeJob(id: string) {
    await this.one(this.db.from("jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", id));
  }
  async failJob(job: JobRow, error: string) {
    if (job.attempts >= job.max_attempts) {
      await this.one(this.db.from("jobs").update({ status: "failed", last_error: error, updated_at: new Date().toISOString() }).eq("id", job.id));
      await this.one(this.db.from("dead_letters").insert({ job_id: job.id, kind: job.kind, payload: job.payload, error, attempts: job.attempts }));
      return "dead" as const;
    }
    await this.one(this.db.from("jobs").update({
      status: "pending", last_error: error, updated_at: new Date().toISOString(),
      run_after: new Date(Date.now() + backoffMs(job.attempts)).toISOString(),
    }).eq("id", job.id));
    return "retry" as const;
  }
  async listDeadLetters(limit = 100) {
    return this.one<DeadLetterRow[]>(this.db.from("dead_letters").select().order("created_at", { ascending: false }).limit(limit));
  }
  async listJobs(status?: JobRow["status"]) {
    let q = this.db.from("jobs").select().order("created_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    return this.one<JobRow[]>(q);
  }
}
