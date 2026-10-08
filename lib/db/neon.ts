import { neon } from "@neondatabase/serverless";
import { backoffMs, type Repo } from "./repo";
import type {
  BookingRow, CallRow, DeadLetterRow, JobRow, LeadFilter, LeadRow, NewCall, NewLead,
  NewNotification, NotificationRow, WebhookEventRow,
} from "./types";

/**
 * Production store on Neon Postgres, via Neon's HTTP driver (one round trip
 * per query, suited to Vercel functions). Server-side only: DATABASE_URL is
 * a full-access connection string.
 */

type Row = Record<string, unknown>;
/** Runs one parameterised query and returns its rows. Tests inject an in-process Postgres here. */
export type QueryFn = (text: string, params: unknown[]) => Promise<Row[]>;

/** jsonb columns per table (sent as JSON text and cast). */
const JSON_COLS: Record<string, string[]> = {
  leads: ["facts", "criteria"],
  webhook_events: ["payload"],
  jobs: ["payload"],
  dead_letters: ["payload"],
};
/** numeric columns come back as strings from Postgres. */
const NUMERIC_COLS = new Set(["voice_cost_usd", "llm_cost_usd", "ring_sec"]);

function toRow<T>(r: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    out[k] = v instanceof Date ? v.toISOString() : NUMERIC_COLS.has(k) && v != null ? Number(v) : v;
  }
  return out as T;
}

export class NeonRepo implements Repo {
  readonly kind = "neon" as const;
  private run: QueryFn;

  constructor(databaseUrlOrQuery: string | QueryFn) {
    if (typeof databaseUrlOrQuery === "string") {
      const sql = neon(databaseUrlOrQuery);
      this.run = async (text, params) => (await sql.query(text, params)) as Row[];
    } else this.run = databaseUrlOrQuery;
  }

  private async q<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const rows = await this.run(text, params);
    return rows.map((r) => toRow<T>(r));
  }
  private async one<T>(text: string, params: unknown[] = []): Promise<T> {
    const [row] = await this.q<T>(text, params);
    if (!row) throw new Error("db: no row returned");
    return row;
  }
  private async maybe<T>(text: string, params: unknown[] = []): Promise<T | null> {
    const [row] = await this.q<T>(text, params);
    return row ?? null;
  }

  /** Column list, placeholders and values for an insert. Column names are from code, never input. */
  private cols(table: string, data: Row) {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const json = JSON_COLS[table] ?? [];
    const values = keys.map((k) => (json.includes(k) && data[k] !== null ? JSON.stringify(data[k]) : data[k]));
    const ph = keys.map((k, i) => (json.includes(k) ? `$${i + 1}::jsonb` : `$${i + 1}`));
    return { keys, values, ph };
  }
  private insertSql(table: string, data: Row, suffix = "") {
    const { keys, values, ph } = this.cols(table, data);
    return { text: `insert into ${table} (${keys.join(", ")}) values (${ph.join(", ")}) ${suffix} returning *`, values };
  }
  private async update<T>(table: string, id: string, patch: Row): Promise<T> {
    const { keys, values, ph } = this.cols(table, patch);
    if (!keys.length) return this.one<T>(`select * from ${table} where id = $1`, [id]);
    const set = keys.map((k, i) => `${k} = ${ph[i]}`).join(", ");
    return this.one<T>(`update ${table} set ${set} where id = $${keys.length + 1} returning *`, [...values, id]);
  }

  async saveWebhookEvent(e: Omit<WebhookEventRow, "id" | "received_at" | "processed_at" | "error">) {
    const { text, values } = this.insertSql("webhook_events", e as Row, "on conflict (source, external_id) where external_id is not null do nothing");
    const row = await this.maybe<WebhookEventRow>(text, values);
    if (row) return { row, duplicate: false };
    const existing = await this.one<WebhookEventRow>(`select * from webhook_events where source = $1 and external_id = $2`, [e.source, e.external_id]);
    return { row: existing, duplicate: true };
  }
  async markWebhookProcessed(id: string, error: string | null = null) {
    await this.q(`update webhook_events set processed_at = now(), error = $2 where id = $1`, [id, error]);
  }
  async getWebhookEvent(id: string) { return this.maybe<WebhookEventRow>(`select * from webhook_events where id = $1`, [id]); }

  async upsertCall(c: NewCall) {
    const { keys, values, ph } = this.cols("calls", c as Row);
    const set = keys.filter((k) => k !== "provider_call_id").map((k) => `${k} = excluded.${k}`).join(", ");
    return this.one<CallRow>(
      `insert into calls (${keys.join(", ")}) values (${ph.join(", ")}) on conflict (provider_call_id) do update set ${set} returning *`, values);
  }
  async updateCall(id: string, patch: Partial<CallRow>) { return this.update<CallRow>("calls", id, patch as Row); }
  async getCall(id: string) { return this.maybe<CallRow>(`select * from calls where id = $1`, [id]); }
  async getCallByProviderId(pid: string) { return this.maybe<CallRow>(`select * from calls where provider_call_id = $1`, [pid]); }
  async listCallsForLead(leadId: string) {
    return this.q<CallRow>(`select * from calls where lead_id = $1 order by started_at desc nulls last`, [leadId]);
  }
  async listCalls(opts: { since?: string; limit?: number } = {}) {
    return this.q<CallRow>(
      `select * from calls where ($1::timestamptz is null or coalesce(started_at, created_at) >= $1) order by started_at desc nulls last limit $2`,
      [opts.since ?? null, opts.limit ?? 500]);
  }

  async findLeadByPhone(phone: string, channel = "phone") {
    return this.maybe<LeadRow>(`select * from leads where phone = $1 and channel = $2`, [phone, channel]);
  }
  async insertLead(l: NewLead) {
    const { text, values } = this.insertSql("leads", l as Row);
    return this.one<LeadRow>(text, values);
  }
  async updateLead(id: string, patch: Partial<LeadRow>) {
    return this.update<LeadRow>("leads", id, { ...patch, updated_at: new Date().toISOString() } as Row);
  }
  async getLead(id: string) { return this.maybe<LeadRow>(`select * from leads where id = $1`, [id]); }
  async listLeads(f: LeadFilter = {}) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (clause: string, v: unknown) => { params.push(v); where.push(clause.replace("?", `$${params.length}`)); };
    if (f.verdict) add("verdict = ?", f.verdict);
    if (f.booking_status) add("booking_status = ?", f.booking_status);
    if (f.since) add("last_call_at >= ?", f.since);
    if (f.needsReview === true) where.push("cardinality(review_reasons) > 0 and review_resolved_at is null");
    if (f.needsReview === false) where.push("(cardinality(review_reasons) = 0 or review_resolved_at is not null)");
    if (f.search) {
      params.push(`%${f.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const p = `$${params.length}`;
      where.push(`(name ilike ${p} or phone ilike ${p} or locality ilike ${p} or email ilike ${p})`);
    }
    params.push(f.limit ?? 500);
    return this.q<LeadRow>(
      `select * from leads ${where.length ? `where ${where.join(" and ")}` : ""} order by last_call_at desc limit $${params.length}`, params);
  }

  async upsertBooking(b: Omit<BookingRow, "id" | "created_at">) {
    const { keys, values, ph } = this.cols("bookings", b as Row);
    const set = keys.filter((k) => k !== "provider_booking_id").map((k) => `${k} = excluded.${k}`).join(", ");
    return this.one<BookingRow>(
      `insert into bookings (${keys.join(", ")}) values (${ph.join(", ")}) on conflict (provider_booking_id) do update set ${set} returning *`, values);
  }
  async listBookingsForLead(leadId: string) { return this.q<BookingRow>(`select * from bookings where lead_id = $1`, [leadId]); }
  async findUnlinkedBookings(phone: string | null, email: string | null) {
    if (!phone && !email) return [];
    return this.q<BookingRow>(
      `select * from bookings where lead_id is null and ((attendee_phone = $1) or (lower(attendee_email) = lower($2)))`, [phone, email]);
  }
  async linkBooking(id: string, leadId: string) { await this.q(`update bookings set lead_id = $2 where id = $1`, [id, leadId]); }

  async insertNotification(n: NewNotification) {
    const { text, values } = this.insertSql("notifications", n as Row);
    return this.one<NotificationRow>(text, values);
  }
  async updateNotification(id: string, patch: Partial<NotificationRow>) { return this.update<NotificationRow>("notifications", id, patch as Row); }
  async getNotification(id: string) { return this.maybe<NotificationRow>(`select * from notifications where id = $1`, [id]); }
  async findNotificationByProviderId(pid: string) { return this.maybe<NotificationRow>(`select * from notifications where provider_id = $1`, [pid]); }
  async listNotifications(opts: { leadId?: string; since?: string } = {}) {
    return this.q<NotificationRow>(
      `select * from notifications where ($1::uuid is null or lead_id = $1) and ($2::timestamptz is null or created_at >= $2) order by created_at desc`,
      [opts.leadId ?? null, opts.since ?? null]);
  }
  async listUnacknowledged(before: string) {
    return this.q<NotificationRow>(
      `select * from notifications where kind in ('handoff','urgent','manual_booking') and acknowledged_at is null
       and status in ('sent','delivered','delayed') and sent_at <= $1`, [before]);
  }

  async enqueueJob(kind: string, payload: Record<string, unknown>, opts: { runAfter?: string; maxAttempts?: number } = {}) {
    return this.one<JobRow>(
      `insert into jobs (kind, payload, run_after, max_attempts) values ($1, $2::jsonb, $3, $4) returning *`,
      [kind, JSON.stringify(payload), opts.runAfter ?? new Date().toISOString(), opts.maxAttempts ?? 5]);
  }
  async claimDueJobs(limit: number) { return this.q<JobRow>(`select * from claim_jobs($1)`, [limit]); }
  async completeJob(id: string) { await this.q(`update jobs set status = 'done', updated_at = now() where id = $1`, [id]); }
  async failJob(job: JobRow, error: string) {
    if (job.attempts >= job.max_attempts) {
      await this.q(`update jobs set status = 'failed', last_error = $2, updated_at = now() where id = $1`, [job.id, error]);
      await this.q(`insert into dead_letters (job_id, kind, payload, error, attempts) values ($1, $2, $3::jsonb, $4, $5)`,
        [job.id, job.kind, JSON.stringify(job.payload), error, job.attempts]);
      return "dead" as const;
    }
    await this.q(`update jobs set status = 'pending', last_error = $2, run_after = $3, updated_at = now() where id = $1`,
      [job.id, error, new Date(Date.now() + backoffMs(job.attempts)).toISOString()]);
    return "retry" as const;
  }
  async listDeadLetters(limit = 100) { return this.q<DeadLetterRow>(`select * from dead_letters order by created_at desc limit $1`, [limit]); }
  async listJobs(status?: JobRow["status"]) {
    return this.q<JobRow>(`select * from jobs where ($1::text is null or status = $1) order by created_at desc limit 200`, [status ?? null]);
  }
}
