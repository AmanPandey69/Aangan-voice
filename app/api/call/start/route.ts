import { env } from "@/lib/env";
import { services } from "@/lib/container";
import { json, logError } from "@/lib/http/respond";
import { startVaaniWebCall } from "@/lib/adapters/voice/vaani-webrtc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Public: the "Talk to Aangan Studio" page calls this to start an internet call.
 * Every call costs money, so it is limited per visitor and per day, and only
 * accepts requests from this app's own pages (including when embedded).
 */
const perVisitor = new Map<string, number[]>();
const VISITOR_LIMIT = 4;          // calls
const VISITOR_WINDOW_MS = 30 * 60_000;

export async function POST(req: Request) {
  const apiKey = env.vaaniApiKey(), agentId = env.vaaniAgentId();
  if (!apiKey || !agentId || env.mockAll) return json({ error: "Calling isn't set up yet." }, 503);

  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host && origin !== env.appBaseUrl) {
    return json({ error: "forbidden" }, 403);
  }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (perVisitor.get(ip) ?? []).filter((t) => now - t < VISITOR_WINDOW_MS);
  if (recent.length >= VISITOR_LIMIT) return json({ error: "Too many calls from this device. Please try again a little later." }, 429);

  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const today = await services().repo.listCalls({ since: dayStart.toISOString(), limit: env.webCallDailyLimit() + 1 });
  if (today.length >= env.webCallDailyLimit()) return json({ error: "We're receiving a lot of calls right now. Please try again tomorrow." }, 429);

  try {
    const session = await startVaaniWebCall(apiKey, agentId);
    perVisitor.set(ip, [...recent, now]);
    return json(session);
  } catch (err) {
    logError("call.start", err);
    return json({ error: "Couldn't connect right now. Please try again in a minute." }, 502);
  }
}
