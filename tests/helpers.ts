import { MemoryRepo } from "@/lib/db/memory";
import { MockVoice } from "@/lib/adapters/voice/mock";
import { MockCalendar } from "@/lib/adapters/calendar/mock";
import { MockCRM } from "@/lib/adapters/crm/mock";
import { MockNotifier } from "@/lib/adapters/notifier/mock";
import { MockLLM } from "@/lib/adapters/llm/mock";
import { setServices, type Services } from "@/lib/container";
import type { Fixture, FixtureCall } from "@/fixtures/load";

export const SECRET = "test-secret";

export function freshServices(): Services & { repo: MemoryRepo; voice: MockVoice } {
  process.env.DESIGNER_EMAIL = "designer@example.com";
  process.env.FRONT_DESK_EMAIL = "desk@example.com";
  process.env.ACK_TOKEN_SECRET = "ack-secret";
  process.env.APP_BASE_URL = "https://aangan.example";
  MockNotifier.outbox = [];
  MockCRM.synced = [];
  MockCalendar.booked.clear();
  MockLLM.clear();
  const s = {
    repo: new MemoryRepo(), voice: new MockVoice(SECRET), calendar: new MockCalendar(SECRET),
    crm: new MockCRM(), notifier: new MockNotifier(SECRET), llm: new MockLLM(),
  };
  setServices(s);
  return s;
}

/** Mock-provider end-of-call payload for a fixture call. */
export function webhookPayload(fx: Fixture, call: FixtureCall) {
  return {
    event_id: `evt-${call.call_id}`, event: "call.ended",
    call: {
      providerCallId: call.call_id, callerPhone: fx.caller_phone, startedAt: call.started_at,
      endedAt: new Date(Date.parse(call.started_at) + call.duration_sec * 1000).toISOString(),
      durationSec: call.duration_sec, status: call.status, turns: call.turns, recordingUrl: `https://rec.example/${call.call_id}.mp3`,
      ringSec: 2, costUsd: 0.05 * Math.ceil(call.duration_sec / 60),
    },
  };
}
