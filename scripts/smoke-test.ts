/**
 * Smoke test: runs one mock call through a running deployment.
 *
 *   BASE_URL=https://your-app.vercel.app SMOKE_SECRET=<VAANI_WEBHOOK_SECRET> npm run smoke
 *
 * Works while the voice adapter is in mock mode (no VAANI_API_KEY set, or
 * MOCK_MODE=true). Steps: health → evaluate tool → availability → book →
 * end-of-call webhook → duplicate redelivery. Uses a fresh fake caller
 * number each run. Exits non-zero on any failure.
 * Pass --seed to send several fixture calls instead (local dashboard demo).
 */
import { createHmac } from "node:crypto";
import { loadFixtures } from "../fixtures/load";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.SMOKE_SECRET ?? process.env.VAANI_WEBHOOK_SECRET ?? "dev-only-VAANI_WEBHOOK_SECRET";
const sign = (raw: string) => createHmac("sha256", SECRET).update(raw).digest("hex");

async function post(path: string, body: unknown, headers: Record<string, string>) {
  const raw = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: raw, headers: { "content-type": "application/json", ...headers } });
  const text = await res.text();
  let json: unknown; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json: json as Record<string, unknown> };
}
const tool = (path: string, body: unknown) => post(path, body, { "x-tool-secret": SECRET });
const webhook = (body: unknown) => post("/api/vaani/webhook", body, { "x-mock-signature": sign(JSON.stringify(body)) });

function check(cond: unknown, msg: string) {
  if (!cond) { console.error(`✗ ${msg}`); process.exit(1); }
  console.log(`✓ ${msg}`);
}

async function smoke() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check(health.ok, `health ok (adapters: ${JSON.stringify(health.adapters)})`);
  check(health.adapters.voice === "mock", "voice adapter is in mock mode (required for this smoke test)");

  const callId = `smoke-${Date.now()}`;
  const phone = `+9190000${String(Date.now()).slice(-5)}`;

  const unauth = await post("/api/tools/evaluate", {}, {});
  check(unauth.status === 401, "tool endpoint rejects unauthenticated requests");

  const ev = await tool("/api/tools/evaluate", { call_id: callId, caller_phone: phone, args: { facts: { locality: "Baner", scope_type: "full_home", wants_execution: true, completion_by: "2027-06-01", site_available_from: new Date().toISOString().slice(0, 10) } } });
  check(ev.status === 200 && ev.json.next_action === "book", `evaluate → ${ev.json.next_action}`);

  const av = await tool("/api/tools/check-availability", { call_id: callId, args: {} });
  const slots = av.json.slots as { start: string; spoken: string }[];
  check(av.status === 200 && slots?.length > 0, `availability → ${slots?.length} slots (first: ${slots?.[0]?.spoken})`);

  const bk = await tool("/api/tools/book-slot", { call_id: callId, caller_phone: phone, args: { slot_start: slots[0].start, name: "Smoke Test", locality: "Baner" } });
  check(bk.json.ok === true, `booked ${bk.json.spoken}`);

  const payload = {
    event_id: `evt-${callId}`, event: "call.ended",
    call: {
      providerCallId: callId, callerPhone: phone, startedAt: new Date(Date.now() - 300_000).toISOString(), endedAt: new Date().toISOString(),
      durationSec: 300, status: "completed", ringSec: 1,
      turns: [
        { speaker: "agent", text: "Hi, thank you for calling Aangan Studio. I'm the studio's AI assistant, and this call is recorded." },
        { speaker: "caller", text: "Hi, this is Smoke Test. I have a 2BHK flat in Baner, about 900 sq ft, and we want a full redesign with execution." },
        { speaker: "agent", text: "Lovely. When would you need the project complete?" },
        { speaker: "caller", text: "We'd like it done by June next year. My wife and I are the owners and we'll both come." },
        { speaker: "agent", text: "You're booked. Thank you for calling Aangan Studio." },
      ],
    },
  };
  const badSig = await post("/api/vaani/webhook", payload, { "x-mock-signature": "bad" });
  check(badSig.status === 401, "webhook rejects a bad signature");
  const wh = await webhook(payload);
  check(wh.status === 200 && wh.json.queued === true, "end-of-call webhook accepted and queued");
  const dup = await webhook(payload);
  check(dup.json.duplicate === true, "redelivery deduplicated");
  console.log(`\nSmoke test passed. Open ${BASE}/calls and look for "Smoke Test" (${phone}).`);
}

async function seed() {
  for (const fx of loadFixtures()) {
    for (const call of fx.calls) {
      const res = await webhook({
        event_id: `seed-${call.call_id}-${Date.now()}`, event: "call.ended",
        call: { providerCallId: `${call.call_id}-${Date.now()}`, callerPhone: fx.caller_phone, startedAt: call.started_at,
          durationSec: call.duration_sec, status: call.status, turns: call.turns, ringSec: 2, costUsd: 0.04 * Math.ceil(call.duration_sec / 60),
          recordingUrl: call.status === "missed" ? null : `https://example.com/recordings/${call.call_id}.mp3` },
      });
      console.log(fx.id, res.status);
    }
  }
}

(process.argv.includes("--seed") ? seed() : smoke()).catch((e) => { console.error(e); process.exit(1); });
