/**
 * Smoke test: runs one mock call through a running deployment.
 *
 *   BASE_URL=https://your-app.vercel.app SMOKE_SECRET=<VAANI_WEBHOOK_SECRET> npm run smoke
 *
 * Works with the mock or the real Vaani adapter (signs requests the way the
 * deployed adapter expects). Steps: health → evaluate tool → availability →
 * (book, only with SMOKE_BOOK=1 when Cal.com is live) → call_started →
 * end-of-call webhook → duplicate redelivery.
 * The caller number is +910000xxxxxx, which the app treats as a test call:
 * no HubSpot sync and no designer email, even in production.
 * Exits non-zero on any failure.
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
let voiceMode = "mock";
function webhook(body: unknown) {
  const raw = JSON.stringify(body);
  if (voiceMode === "mock") return post("/api/vaani/webhook", body, { "x-mock-signature": sign(raw) });
  const ts = String(Math.floor(Date.now() / 1000));
  return post("/api/vaani/webhook", body, { "x-vaani-timestamp": ts, "x-vaani-signature": `sha256=${sign(`${ts}.${raw}`)}` });
}

function check(cond: unknown, msg: string) {
  if (!cond) { console.error(`✗ ${msg}`); process.exit(1); }
  console.log(`✓ ${msg}`);
}

async function smoke() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check(health.ok, `health ok (adapters: ${JSON.stringify(health.adapters)})`);
  voiceMode = health.adapters.voice;

  const callId = `smoke-${Date.now()}`;
  const phone = `+910000${String(Date.now()).slice(-6)}`; // test number: never synced or emailed

  const unauth = await post("/api/tools/evaluate", {}, {});
  check(unauth.status === 401, "tool endpoint rejects unauthenticated requests");

  const ev = await tool("/api/tools/evaluate", { call_id: callId, caller_phone: phone, args: { facts: { locality: "Baner", scope_type: "full_home", wants_execution: true, completion_by: "2027-06-01", site_available_from: new Date().toISOString().slice(0, 10) } } });
  check(ev.status === 200 && ev.json.next_action === "book", `evaluate → ${ev.json.next_action}`);

  const av = await tool("/api/tools/check-availability", { call_id: callId, args: {} });
  const slots = av.json.slots as { start: string; spoken: string }[];
  check(av.status === 200 && Array.isArray(slots), `availability → ${slots?.length ?? 0} slots${slots?.[0] ? ` (first: ${slots[0].spoken})` : ""}`);

  if (health.adapters.calendar === "mock" || process.env.SMOKE_BOOK === "1") {
    const bk = await tool("/api/tools/book-slot", { call_id: callId, caller_phone: phone, args: { slot_start: slots[0].start, name: "Smoke Test", locality: "Baner" } });
    check(bk.json.ok === true, `booked ${bk.json.spoken}`);
  } else console.log("- skipped booking (Cal.com is live; set SMOKE_BOOK=1 to create a real booking)");

  const turns = [
    { speaker: "agent", text: "Hi, thank you for calling Aangan Studio. I'm the studio's AI assistant, and this call is recorded." },
    { speaker: "caller", text: "Hi, this is Smoke Test. I have a 2BHK flat in Baner, about 900 sq ft, and we want a full redesign with execution." },
    { speaker: "agent", text: "Lovely. When would you need the project complete?" },
    { speaker: "caller", text: "We'd like it done by June next year. My wife and I are the owners and we'll both come." },
    { speaker: "agent", text: "You're booked. Thank you for calling Aangan Studio." },
  ];
  const now = new Date();
  const payload = voiceMode === "mock"
    ? { event_id: `evt-${callId}`, event: "call.ended", call: { providerCallId: callId, callerPhone: phone, startedAt: new Date(now.getTime() - 300_000).toISOString(), endedAt: now.toISOString(), durationSec: 300, status: "completed", ringSec: 1, turns } }
    : { event: "call_postprocessing", call_id: callId, timestamp: now.toISOString(), data: { room_name: callId, call_id: callId, call_duration: 300000, end_reason: "Call ended", summary: "Smoke test", entities: {}, dispositions: { qualification: "qualified" }, recording_url: null,
        transcript: turns.map((t) => `[00:00:00] ${t.speaker === "agent" ? "AGENT" : "USER"}: ${t.text}`).join("\n\n") } };

  if (voiceMode !== "mock") {
    const started = await webhook({ event: "call_started", room_name: callId, status: "active", phone_number: phone });
    check(started.status === 200, "call_started accepted");
  }
  const badSig = await post("/api/vaani/webhook", payload, { "x-mock-signature": "bad", "x-vaani-signature": "sha256=bad", "x-vaani-timestamp": String(Math.floor(Date.now() / 1000)) });
  check(badSig.status === 401, "webhook rejects a bad signature");
  const wh = await webhook(payload);
  check(wh.status === 200 && wh.json.queued === true, "end-of-call webhook accepted and queued");
  const dup = await webhook(payload);
  check(dup.json.duplicate === true, "redelivery deduplicated");
  console.log(`\nSmoke test passed. In a few seconds, open ${BASE}/calls and search for ${phone}.`);
}

async function seed() {
  if (BASE.includes("vercel.app") || process.env.NODE_ENV === "production") { console.error("--seed is for local demos only"); process.exit(1); }
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
