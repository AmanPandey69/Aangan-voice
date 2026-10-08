-- Aangan Studio call automation — initial schema.
-- Run in the Supabase SQL editor, or `supabase db push`.
-- RLS is enabled on every table with NO policies: only the service role
-- (used server-side by the Vercel app) can read or write. The anon key
-- cannot read anything. No pricing data is ever stored here.

create extension if not exists pgcrypto;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  channel text not null default 'phone',
  name text,
  email text,
  locality text,
  facts jsonb not null default '{}'::jsonb,
  verdict text check (verdict in ('qualified','declined','escalate')),
  urgent boolean not null default false,
  reason text,
  criteria jsonb,
  flags text[] not null default '{}',
  uncertainties text[] not null default '{}',
  live_verdict text,
  verdict_mismatch boolean not null default false,
  price_leak boolean not null default false,
  booking_status text not null default 'none'
    check (booking_status in ('none','booked','needs_manual_booking','not_offered','cancelled')),
  booked_slot timestamptz,
  preferred_time_raw text,
  hubspot_contact_id text,
  hubspot_deal_id text,
  review_reasons text[] not null default '{}',
  review_resolved_at timestamptz,
  extraction_failed boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_call_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open lead per phone number (a dropped call and redial is one lead).
create unique index if not exists leads_phone_channel_key on leads (phone, channel);
create index if not exists leads_verdict_idx on leads (verdict);
create index if not exists leads_last_call_idx on leads (last_call_at desc);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('vaani','calcom','resend')),
  event_type text,
  external_id text,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
create unique index if not exists webhook_events_dedupe on webhook_events (source, external_id) where external_id is not null;

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  provider_call_id text not null unique,
  lead_id uuid references leads(id) on delete set null,
  channel text not null default 'phone',
  caller_phone text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec integer not null default 0,
  status text not null check (status in ('completed','dropped','missed','failed')),
  transcript text,
  recording_url text,
  live_verdict text,
  ring_sec numeric,
  voice_cost_usd numeric not null default 0,
  llm_cost_usd numeric not null default 0,
  llm_input_tokens integer not null default 0,
  llm_output_tokens integer not null default 0,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','ok','failed','skipped')),
  webhook_event_id uuid references webhook_events(id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists calls_lead_idx on calls (lead_id);
create index if not exists calls_started_idx on calls (started_at desc);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  provider text not null default 'calcom',
  provider_booking_id text not null unique,
  start_at timestamptz not null,
  end_at timestamptz,
  status text not null default 'accepted',
  attendee_email text,
  attendee_phone text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  kind text not null check (kind in ('handoff','urgent','manual_booking','reminder')),
  recipient text not null,
  cc text,
  subject text not null,
  provider text not null default 'resend',
  provider_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','delayed','bounced','complained','failed','blocked')),
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  reminder_sent_at timestamptz,
  flagged_unacknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_lead_idx on notifications (lead_id);
create unique index if not exists notifications_provider_id_key on notifications (provider_id) where provider_id is not null;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_due_idx on jobs (status, run_after);

create table if not exists dead_letters (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  kind text not null,
  payload jsonb not null,
  error text,
  attempts integer not null,
  created_at timestamptz not null default now()
);

-- Atomically claim due jobs (used by the retry cron).
create or replace function claim_jobs(max_jobs integer)
returns setof jobs language sql as $$
  update jobs set status = 'running', attempts = attempts + 1, updated_at = now()
  where id in (
    select id from jobs
    where status = 'pending' and run_after <= now()
    order by run_after
    limit max_jobs
    for update skip locked
  )
  returning *;
$$;

alter table leads enable row level security;
alter table webhook_events enable row level security;
alter table calls enable row level security;
alter table bookings enable row level security;
alter table notifications enable row level security;
alter table jobs enable row level security;
alter table dead_letters enable row level security;
