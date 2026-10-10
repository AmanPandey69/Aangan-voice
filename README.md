# Aangan Studio — call automation

Phone enquiries to Aangan Studio (interior design, Pune) are answered by a Vaani voice agent that qualifies the caller and books a consultation. This app receives the call, decides the verdict with deterministic rules, stores the lead in Neon Postgres, syncs HubSpot, emails the designer a handoff once a booking exists, and shows everything on a password-protected dashboard.

```
Caller ─► Vaani agent ──(Cal.com booking during the call)──► Cal.com
              │                                               │ BOOKING_CREATED
              │ call_started / call_postprocessing            ▼
              ▼                                      /api/calcom/webhook
      /api/vaani/webhook ─► queue ─► extract (Gemini) ─► rules engine ─► Neon
                                                    │                  │
                                                    ├─► HubSpot        └─► dashboard
                                                    └─► handoff email (Resend) ─► designer ─► /api/ack
```

Scope is inbound phone calls. The qualification logic (`lib/rules`) and handoff (`lib/handoff`, `lib/pipeline/notify.ts`) work on a channel-independent `LeadFacts` shape, so WhatsApp or the web form can be added later as new inputs to the same pipeline.

## Non-negotiables, and where they're enforced

| Rule | Enforced in |
|---|---|
| Never state a price | Fixed pricing line in `lib/rules/copy.ts` and the agent prompt. `lib/guard/price-guard.ts` scans every email (blocks the send) and every agent line in each transcript (flags the call for review). `tests/price-leak.test.ts` fails the build on any price-like content in the prompt, fixed lines, engine output or emails. `pricing.md` is not in the repo. |
| Never ask for budget | Agent prompt. The extractor keeps a budget only if `budget_volunteered`. Emails never include the caller's figure. |
| Never tell a caller they're unqualified | Closing lines in `copy.ts`. A test checks they contain no "qualif…" wording. |
| Wrongly declining a good lead is worse | Anything unclear after the call qualifies with a note. Budget, decision-maker and unknown localities never auto-decline. |
| AI + recording disclosure | First line of the agent prompt (tested). |
| No secrets in repo/logs/client | `.env*` git-ignored. Logs carry ids and error messages only. All integrations run server-side. |

## Run it locally (no keys needed)

```bash
npm install
cp .env.example .env.local   # MOCK_MODE=true, then set DASHBOARD_PASSWORD
npm test                     # rules, replays, price-leak, email, pipeline, adapters
npm run dev                  # http://localhost:3000
```

In another terminal, seed the dashboard with the 20 September calls and run the smoke test:

```bash
npx tsx scripts/smoke-test.ts --seed
```

```bash
npm run smoke
```

In mock mode the database is in memory, emails go to an in-memory outbox, and extraction uses a keyword extractor. A yellow banner on the dashboard lists every integration that is still mocked.

## Tests and replays

- `npm test` runs everything. Vercel runs it before every build (`vercel-build`), so a failing test, including any price leak, stops the deploy.
- `npm run replay` replays T01–T20 (`fixtures/transcripts/*.json`, parsed from the September PDF) through the rules engine, using a hand-labelled extraction for each call. `tests/pipeline.test.ts` sends the same calls through the whole pipeline (webhook → extraction → rules → DB → CRM → email) with mock adapters.
- `LLM_API_KEY=... npm run replay:live` sends the real transcripts through Gemini and reports any verdict or field that differs from the labels. This makes about 19 API calls and costs a few cents.

Expected outcomes:
- **Qualified:** T01, T02, T05, T06, T11, T12, T13, T14, T15, T16, T17, T20.
- **Declined:** T03, T04, T07, T18, T19.
- **Escalated:** T09 (urgent) and **T10 (non-urgent budget review; see decision 4)**.
- **Missed call:** T08.
- **Dedupe:** T17 is two calls from one number and becomes one lead.

## Open decisions (all in `config/rules.ts`)

The source docs conflict in places. Each conflict is a flag, so changing your mind is a one-line edit followed by `npm test`.

| # | Question | Default | Why |
|---|---|---|---|
| 1 | Does one failed criterion decline, or two? (`qualified.md` says both) | `minFailedCriteriaToDecline: 1` | T03, T04, T18 and T19 each fail one criterion and are expected to decline. The two-failure wording is still used for the closing line. |
| 2 | Timeline: 6 weeks (`services.md`) or 8–10 weeks (`qualified.md`)? | `minWeeksToCompletion: 6`, `siteAvailableWithinWeeks: 10`, `siteAvailableLateOutcome: "unclear"` | Both apply, as two separate checks: completion date and site availability. Using 8–10 weeks as the completion minimum would risk declining T02. |
| 3 | 500 sq ft commercial minimum (only mentioned on the T18 call) | `commercialMinSqftEnabled: true` | T18 is expected to decline. Such leads also land in the review queue as "small commercial". Above about 3,000 sq ft is noted, never declined. |
| 4 | Volunteered budget that looks too low | `budgetConcernOutcome: "escalate"` | Your choice: never auto-decline on budget. The agent closes without booking (no numbers), and Nikhil gets a non-urgent "Review needed (budget check)" email. **T10 therefore escalates instead of declining.** |
| 5 | Criteria still unclear after the call | `postCallUnclearOutcome: "qualify_with_note"` | T11, T13, T14 and T16 never covered everything and are expected to qualify. |
| 6 | Angry caller vs escalation | Escalate only on an existing-client complaint, a request for a person, abuse, or being misunderstood twice | T16 is frustrated but expected to qualify. It gets a "handle with care" flag instead. |
| 7 | Localities not on the `services.md` list ("and adjoining areas", e.g. Kharadi, Nanded City) | `unknownLocalityOutcome: "unclear"` | Ask once, then qualify with a note and send to review. Add confirmed areas to `PUNE_CONFIRMED_EXTRA` in `config/localities.ts`. |
| 8 | Priority threshold | `priorityMinSqft: 2000` | T05 (2,400 sq ft) and T12 (5,500 sq ft) get the urgent "Priority consultation booked" email. |
| 9 | Acknowledgement reminders | Reminder after 120 min, dashboard flag after 24 h | On Hobby these run when the daily cron fires or after any webhook. See "Cron" below. |
| 10 | Fixed pricing line punctuation | Your brief's wording (full stops) | `pricing.md` uses an em dash. The meaning is identical. |

## Accounts and keys you need

| Service | What to create | Env vars |
|---|---|---|
| Vercel (Hobby) | A project linked to the GitHub repo | none |
| Neon | A project (region: AWS Asia Pacific, Singapore or Mumbai if offered). Run `db/schema.sql` in the Neon SQL editor. | `DATABASE_URL` (the **pooled** connection string) |
| Google Gemini | An API key from Google AI Studio (Claude also supported with `LLM_PROVIDER=anthropic`) | `LLM_API_KEY` |
| Vaani (app.vaanivoice.ai) | The agent, an inbound number, a webhook and an API key | `VAANI_API_KEY`, `VAANI_WEBHOOK_SECRET` |
| Cal.com | A "Design consultation" event type, an API key and a webhook | `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID`, `CALCOM_WEBHOOK_SECRET` |
| HubSpot | A **service key** (Development → Keys → Service keys; legacy private apps also work) with `crm.objects.contacts.read/write` and `crm.objects.deals.read/write` | `HUBSPOT_TOKEN`, optional `HUBSPOT_PORTAL_ID` |
| Resend | An API key, a **verified sending domain** and a webhook | `RESEND_API_KEY`, `FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` |
| You | Recipients and secrets | `DESIGNER_EMAIL`, `FRONT_DESK_EMAIL`, `DASHBOARD_PASSWORD`, `ACK_TOKEN_SECRET`, `CRON_SECRET`, `APP_BASE_URL` |

Generate the long random secrets (`ACK_TOKEN_SECRET`, `CRON_SECRET`, `VAANI_WEBHOOK_SECRET`) with:

```bash
openssl rand -base64 32
```

Each integration switches from mock to real once its keys are set. `MOCK_MODE=true` forces every integration back to its mock. `GET /api/health` shows which are live.

## Connecting each service

### Vaani
1. **Agent → Persona → system prompt:** paste `agent/system-prompt.md` (the part below the line).
2. **Language:** set English with auto-detect, so Hindi and Marathi callers get switched to. *Vaani's public docs don't confirm Marathi; test it on a call.*
3. **Settings → Integrations → Cal.com:** add your Cal.com API key and choose the consultation event type. This is how the agent books during the call.
4. **Analysis:** add a disposition named `qualification` with the values `qualified`, `declined` and `escalate`. The app compares it with its own verdict, and mismatches go to the review queue.
5. **Deployment:** set the inbound number.
6. **Settings → Webhooks:** add the webhook URL (printed after deploy). Vaani documents HMAC signing (`X-Vaani-Signature`, `X-Vaani-Timestamp`). If the dashboard webhook shows a signing secret, use it as `VAANI_WEBHOOK_SECRET`. If it doesn't, the URL with `?token=<VAANI_WEBHOOK_SECRET>` also authenticates.
7. *Optional:* if your plan supports custom functions (not yet in Vaani's public docs), add `evaluate_enquiry` → `/api/tools/evaluate` with header `x-tool-secret: <VAANI_WEBHOOK_SECRET>`. That lets the live agent use the exact same rules engine. Without it, the prompt carries the same rules in words.

### Cal.com
1. **Event type** "Design consultation", Asia/Kolkata timezone. Make **email optional** and phone required; callers often have no email to give. If email is required, bookings without one become "needs manual booking".
2. **Settings → Developer → Webhooks:** add the webhook URL (printed after deploy) for `BOOKING_CREATED`, `BOOKING_RESCHEDULED` and `BOOKING_CANCELLED`, with a secret. That secret is `CALCOM_WEBHOOK_SECRET`.

### Resend
- `onboarding@resend.dev` can only email the Resend account owner. To reach the designer, **verify your domain** under Domains (add the DKIM and SPF TXT records plus the MX record for the `send.` return-path subdomain), then set `FROM_EMAIL` to an address on it, e.g. `Aangan Studio <enquiries@aanganstudio.in>`. Add DMARC once it's verified.
- **Webhooks:** add the webhook URL (printed after deploy) for `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened` and `email.failed`. Copy the `whsec_…` signing secret into `RESEND_WEBHOOK_SECRET`.
- The free tier allows 100 emails a day. Each CC'd recipient counts.

### HubSpot
- Create a service key (Development → Keys → Service keys → Create service key) with the four scopes above. New accounts can't create legacy private apps; older ones can use either.
- Qualified leads become a contact plus a deal in the default pipeline at `appointmentscheduled`. Declined leads become a contact plus a deal at `closedlost` with `closed_lost_reason`. Escalations become a contact only.
- If your pipeline or stage IDs differ, check them with `GET /crm/v3/pipelines/deals` and set `HUBSPOT_PIPELINE`, `HUBSPOT_STAGE_OPEN` and `HUBSPOT_STAGE_LOST`.

### Cron (Vercel Hobby)
- Hobby crons run **at most once a day**: `vercel.json` runs `/api/jobs/retry` daily at 03:30 UTC (09:00 IST). The same queue and reminder sweep also runs after every webhook.
- For hourly retries and reminders, add repository secrets `APP_BASE_URL` and `CRON_SECRET`, and `.github/workflows/retry-jobs.yml` will ping the endpoint hourly.
- Note: Vercel's Hobby plan is for **non-commercial use only**. A studio's lead system is commercial use, so plan to move to Pro, which also allows a 15-minute cron.

## Routes

| Route | Purpose | Auth |
|---|---|---|
| `POST /api/vaani/webhook` | `call_started` stores the caller number. `call_postprocessing` stores the raw payload, queues processing and returns immediately. | Vaani HMAC or URL token |
| `POST /api/tools/evaluate` | Live rules engine for the agent | `x-tool-secret` |
| `POST /api/tools/check-availability`, `/book-slot` | Cal.com slots and booking for the agent (when custom functions are used) | `x-tool-secret` |
| `POST /api/calcom/webhook` | Links the booking to the lead and triggers the handoff email | `x-cal-signature-256` |
| `GET /api/ack?token=` | Designer's Acknowledge link | Signed, expiring token |
| `POST /api/resend/webhook` | Delivery, bounce and open events | Svix signature |
| `GET /api/jobs/retry` | Retries failed jobs (dead-letters after 5 attempts) and sends acknowledgement reminders | `Bearer CRON_SECRET` |
| `GET /api/health` | Liveness, plus which adapters are live or mock | none (no data) |

Background work uses Next.js `after()` (Vercel `waitUntil`). Every side effect is a job row, so anything that doesn't finish is retried by the cron and lands in `dead_letters` after five attempts. These appear on the review page.

## Smoke test against a deployment

```bash
BASE_URL=https://<your-app>.vercel.app SMOKE_SECRET=<VAANI_WEBHOOK_SECRET> npm run smoke
```

It checks health and auth, calls the evaluate and availability tools, and sends a signed `call_started` and end-of-call webhook (in Vaani's format when Vaani is live), then checks that a redelivery is deduplicated. The caller number is `+910000…`, which the app treats as a test number: it is processed and shown on the dashboard, but **never sent to HubSpot or emailed**. It does not create a real Cal.com booking unless you set `SMOKE_BOOK=1`.

To check real email delivery, add `--with-email` (or `npm run smoke:email`): the caller number becomes `+910001…`, and the handoff email **is** sent to `DESIGNER_EMAIL` with `[TEST]` at the start of the subject. HubSpot is still skipped.

## Known gaps (marked `TODO(vendor)` in code)

- **Vaani:** custom functions are not publicly documented. Booking uses Vaani's Cal.com integration, and the live verdict comes from the `qualification` disposition. It's also unconfirmed whether dashboard webhooks are signed like campaign webhooks (the URL-token fallback covers this). The timezone of call-history timestamps and per-credit pricing (`VAANI_USD_PER_CREDIT`) are unconfirmed, as is Marathi support.
- **Cal.com:** the webhook signature encoding isn't stated in the docs. The app uses hex HMAC over the raw body; send a test delivery after setup to confirm.
- **HubSpot:** confirmed for the studio's portal (default pipeline stages and `closed_lost_reason`). Re-check if the pipeline is customised.

## Customer call site

Customers talk to the agent at **https://aangan-call.vercel.app** (same Vercel project, its own address). That address only serves the call page; `/call` on the dashboard address redirects there. Embed: `<iframe src="https://aangan-call.vercel.app/?embed=1" allow="microphone" width="100%" height="520" style="border:0"></iframe>`. Extra customer addresses can be listed in `CUSTOMER_HOSTS`.
