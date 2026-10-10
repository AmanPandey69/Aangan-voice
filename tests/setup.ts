import { beforeEach, vi } from "vitest";

/**
 * Tests must never touch real services. Vercel exposes production keys during the
 * build (where the suite runs), so remove them and make any unmocked network call fail.
 */
const REAL_KEYS = [
  "DATABASE_URL", "LLM_API_KEY", "VAANI_API_KEY", "VAANI_WEBHOOK_SECRET", "VAANI_AGENT_ID",
  "CALCOM_API_KEY", "CALCOM_EVENT_TYPE_ID", "CALCOM_WEBHOOK_SECRET", "HUBSPOT_TOKEN", "HUBSPOT_PORTAL_ID",
  "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "FROM_EMAIL", "DESIGNER_EMAIL", "FRONT_DESK_EMAIL",
  "ACK_TOKEN_SECRET", "CRON_SECRET", "DASHBOARD_PASSWORD", "APP_BASE_URL", "VERCEL_ENV", "VERCEL_URL",
];
for (const k of REAL_KEYS) delete process.env[k];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    throw new Error(`Unmocked network call in a test: ${String(url)}`);
  }));
});
