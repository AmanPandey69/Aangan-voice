import { adapterModes, services } from "@/lib/container";
import { json } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + which integrations are live vs mock. No secrets, no data. */
export async function GET() {
  const s = services();
  let db = "ok";
  try { await s.repo.listJobs("pending"); } catch { db = "error"; }
  return json({ ok: db === "ok", db, adapters: adapterModes(s), time: new Date().toISOString() }, db === "ok" ? 200 : 503);
}
