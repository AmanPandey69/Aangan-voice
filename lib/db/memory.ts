import { randomUUID } from "node:crypto";
import { backoffMs, type Repo } from "./repo";
import type {
  BookingRow, CallRow, DeadLetterRow, JobRow, LeadFilter, LeadRow, NewCall, NewLead,
  NewNotification, NotificationRow, WebhookEventRow,
} from "./types";

const now = () => new Date().toISOString();

/** In-memory store for mock mode and tests. Survives Next.js hot reloads via globalThis. */
export class MemoryRepo implements Repo {
  readonly kind = "memory" as const;
  events = new Map<string, WebhookEventRow>();
  calls = new Map<string, CallRow>();
  leads = new Map<string, LeadRow>();
  bookings = new Map<string, BookingRow>();
  notifications = new Map<string, NotificationRow>();
  jobs = new Map<string, JobRow>();
  dead = new Map<string, DeadLetterRow>();

  async saveWebhookEvent(e: Omit<WebhookEventRow, "id" | "received_at" | "processed_at" | "error">) {
    if (e.external_id) {
      const dup = [...this.events.values()].find((x) => x.source === e.source && x.external_id === e.external_id);
      if (dup) return { row: dup, duplicate: true };
    }
    const row: WebhookEventRow = { ...e, id: randomUUID(), received_at: now(), processed_at: null, error: null };
    this.events.set(row.id, row);
    return { row, duplicate: false };
  }
  async markWebhookProcessed(id: string, error: string | null = null) {
    const r = this.events.get(id);
    if (r) this.events.set(id, { ...r, processed_at: now(), error });
  }
  async getWebhookEvent(id: string) { return this.events.get(id) ?? null; }

  async upsertCall(c: NewCall) {
    const existing = await this.getCallByProviderId(c.provider_call_id);
    const row: CallRow = existing ? { ...existing, ...c } : { ...c, id: randomUUID(), created_at: now() };
    this.calls.set(row.id, row);
    return row;
  }
  async updateCall(id: string, patch: Partial<CallRow>) {
    const row = { ...this.must(this.calls, id), ...patch };
    this.calls.set(id, row);
    return row;
  }
  async getCall(id: string) { return this.calls.get(id) ?? null; }
  async getCallByProviderId(pid: string) { return [...this.calls.values()].find((c) => c.provider_call_id === pid) ?? null; }
  async listCallsForLead(leadId: string) {
    return [...this.calls.values()].filter((c) => c.lead_id === leadId).sort(byDesc("started_at"));
  }
  async listCalls(opts: { since?: string; limit?: number } = {}) {
    return [...this.calls.values()].filter((c) => !opts.since || (c.started_at ?? c.created_at) >= opts.since)
      .sort(byDesc("started_at")).slice(0, opts.limit ?? 500);
  }

  async findLeadByPhone(phone: string, channel = "phone") {
    return [...this.leads.values()].find((l) => l.phone === phone && l.channel === channel) ?? null;
  }
  async insertLead(l: NewLead) {
    if (await this.findLeadByPhone(l.phone, l.channel)) throw new Error("duplicate lead phone");
    const t = now();
    const row: LeadRow = { first_seen_at: t, last_call_at: t, updated_at: t, ...l, id: randomUUID(), created_at: t };
    this.leads.set(row.id, row);
    return row;
  }
  async updateLead(id: string, patch: Partial<LeadRow>) {
    const row = { ...this.must(this.leads, id), ...patch, updated_at: now() };
    this.leads.set(id, row);
    return row;
  }
  async getLead(id: string) { return this.leads.get(id) ?? null; }
  async listLeads(f: LeadFilter = {}) {
    const q = f.search?.toLowerCase();
    return [...this.leads.values()]
      .filter((l) => !f.verdict || l.verdict === f.verdict)
      .filter((l) => !f.booking_status || l.booking_status === f.booking_status)
      .filter((l) => f.needsReview === undefined || (l.review_reasons.length > 0 && !l.review_resolved_at) === f.needsReview)
      .filter((l) => !f.since || l.last_call_at >= f.since)
      .filter((l) => !q || [l.name, l.phone, l.locality, l.email].some((v) => v?.toLowerCase().includes(q)))
      .sort(byDesc("last_call_at")).slice(0, f.limit ?? 500);
  }

  async upsertBooking(b: Omit<BookingRow, "id" | "created_at">) {
    const existing = [...this.bookings.values()].find((x) => x.provider_booking_id === b.provider_booking_id);
    const row: BookingRow = existing ? { ...existing, ...b } : { ...b, id: randomUUID(), created_at: now() };
    this.bookings.set(row.id, row);
    return row;
  }
  async listBookingsForLead(leadId: string) { return [...this.bookings.values()].filter((b) => b.lead_id === leadId); }
  async findUnlinkedBookings(phone: string | null, email: string | null) {
    return [...this.bookings.values()].filter((b) => !b.lead_id &&
      ((phone && b.attendee_phone === phone) || (email && b.attendee_email?.toLowerCase() === email.toLowerCase())));
  }
  async linkBooking(id: string, leadId: string) { this.bookings.set(id, { ...this.must(this.bookings, id), lead_id: leadId }); }

  async insertNotification(n: NewNotification) {
    const row: NotificationRow = { ...n, id: randomUUID(), created_at: now() };
    this.notifications.set(row.id, row);
    return row;
  }
  async updateNotification(id: string, patch: Partial<NotificationRow>) {
    const row = { ...this.must(this.notifications, id), ...patch };
    this.notifications.set(id, row);
    return row;
  }
  async getNotification(id: string) { return this.notifications.get(id) ?? null; }
  async findNotificationByProviderId(pid: string) { return [...this.notifications.values()].find((n) => n.provider_id === pid) ?? null; }
  async listNotifications(opts: { leadId?: string; since?: string } = {}) {
    return [...this.notifications.values()]
      .filter((n) => !opts.leadId || n.lead_id === opts.leadId)
      .filter((n) => !opts.since || n.created_at >= opts.since)
      .sort(byDesc("created_at"));
  }
  async listUnacknowledged(before: string) {
    return [...this.notifications.values()].filter((n) =>
      (n.kind === "handoff" || n.kind === "urgent" || n.kind === "manual_booking") &&
      !n.acknowledged_at && n.sent_at && n.sent_at <= before && ["sent", "delivered", "delayed"].includes(n.status));
  }

  async enqueueJob(kind: string, payload: Record<string, unknown>, opts: { runAfter?: string; maxAttempts?: number } = {}) {
    const t = now();
    const row: JobRow = { id: randomUUID(), kind, payload, status: "pending", attempts: 0, max_attempts: opts.maxAttempts ?? 5,
      run_after: opts.runAfter ?? t, last_error: null, created_at: t, updated_at: t };
    this.jobs.set(row.id, row);
    return row;
  }
  async claimDueJobs(limit: number) {
    const t = now();
    const due = [...this.jobs.values()].filter((j) => j.status === "pending" && j.run_after <= t)
      .sort((a, b) => a.run_after.localeCompare(b.run_after)).slice(0, limit);
    return due.map((j) => {
      const row = { ...j, status: "running" as const, attempts: j.attempts + 1, updated_at: t };
      this.jobs.set(j.id, row);
      return row;
    });
  }
  async completeJob(id: string) { this.jobs.set(id, { ...this.must(this.jobs, id), status: "done", updated_at: now() }); }
  async failJob(job: JobRow, error: string) {
    if (job.attempts >= job.max_attempts) {
      this.jobs.set(job.id, { ...job, status: "failed", last_error: error, updated_at: now() });
      const d: DeadLetterRow = { id: randomUUID(), job_id: job.id, kind: job.kind, payload: job.payload, error, attempts: job.attempts, created_at: now() };
      this.dead.set(d.id, d);
      return "dead" as const;
    }
    this.jobs.set(job.id, { ...job, status: "pending", last_error: error, run_after: new Date(Date.now() + backoffMs(job.attempts)).toISOString(), updated_at: now() });
    return "retry" as const;
  }
  async listDeadLetters(limit = 100) { return [...this.dead.values()].sort(byDesc("created_at")).slice(0, limit); }
  async listJobs(status?: JobRow["status"]) { return [...this.jobs.values()].filter((j) => !status || j.status === status); }

  private must<T>(m: Map<string, T>, id: string): T {
    const v = m.get(id);
    if (!v) throw new Error(`not found: ${id}`);
    return v;
  }
}

function byDesc<K extends string>(key: K) {
  return (a: Record<K, unknown>, b: Record<K, unknown>) => String(b[key] ?? "").localeCompare(String(a[key] ?? ""));
}
