import { services } from "@/lib/container";
import { env } from "@/lib/env";
import { runMaintenance } from "@/lib/pipeline/jobs";
import { json } from "@/lib/http/respond";
import { safeEqual } from "@/lib/security/hmac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron target: retries failed jobs (dead-lettering exhausted ones)
 * and sends acknowledgement reminders. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (secret) {
    if (!safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) return json({ error: "unauthorised" }, 401);
  } else if (env.isProduction()) {
    return json({ error: "CRON_SECRET not set" }, 500);
  }
  const result = await runMaintenance(services());
  return json({ ok: true, ...result });
}
