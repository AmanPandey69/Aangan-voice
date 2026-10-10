/**
 * Server-side environment access. Never import from client components.
 * Each integration runs for real only when its keys are present and
 * MOCK_MODE is not "true"; otherwise its mock adapter is used.
 */
const e = (k: string) => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

export const env = {
  get mockAll() { return e("MOCK_MODE") === "true"; },
  get appBaseUrl() { return (e("APP_BASE_URL") ?? (e("VERCEL_URL") ? `https://${e("VERCEL_URL")}` : "http://localhost:3000")).replace(/\/$/, ""); },

  vaaniApiKey: () => e("VAANI_API_KEY"),
  vaaniWebhookSecret: () => e("VAANI_WEBHOOK_SECRET"),
  /** Agent UUID (Vaani → Agents → open the agent; it's in the address bar). Enables the public /call page. */
  vaaniAgentId: () => e("VAANI_AGENT_ID"),
  /** Most internet calls the public /call page may start per day (cost guard). */
  webCallDailyLimit: () => Number(e("WEB_CALL_DAILY_LIMIT") ?? 150),
  calcomApiKey: () => e("CALCOM_API_KEY"),
  calcomEventTypeId: () => e("CALCOM_EVENT_TYPE_ID"),
  calcomWebhookSecret: () => e("CALCOM_WEBHOOK_SECRET"),
  hubspotToken: () => e("HUBSPOT_TOKEN"),
  hubspotPortalId: () => e("HUBSPOT_PORTAL_ID"),
  resendApiKey: () => e("RESEND_API_KEY"),
  resendWebhookSecret: () => e("RESEND_WEBHOOK_SECRET"),
  fromEmail: () => e("FROM_EMAIL") ?? "Aangan Studio <onboarding@resend.dev>",
  designerEmail: () => e("DESIGNER_EMAIL"),
  frontDeskEmail: () => e("FRONT_DESK_EMAIL"),
  ackTokenSecret: () => e("ACK_TOKEN_SECRET"),
  /** Neon Postgres connection string (pooled), e.g. postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require */
  databaseUrl: () => e("DATABASE_URL"),
  llmApiKey: () => e("LLM_API_KEY"),
  /** "gemini" (default) or "anthropic". */
  llmProvider: () => (e("LLM_PROVIDER") === "anthropic" ? "anthropic" : "gemini"),
  dashboardPassword: () => e("DASHBOARD_PASSWORD"),
  cronSecret: () => e("CRON_SECRET"),
  isProduction: () => e("VERCEL_ENV") === "production",
};

/** Secrets used to sign things must exist in production; in dev a fixed fallback is fine. */
export function requireSecret(value: string | undefined, name: string): string {
  if (value) return value;
  if (env.isProduction()) throw new Error(`${name} is not set`);
  return `dev-only-${name}`;
}
