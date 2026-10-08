import { z } from "zod";
import { emptyFacts, LeadFactsSchema } from "@/lib/domain/lead";
import { evaluate } from "@/lib/rules/engine";
import { handleTool } from "@/lib/http/tools";
import { normalisePhone } from "@/lib/phone";
import { logError } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const Args = z.object({
  facts: LeadFactsSchema.partial().default({}),
  asked: z.array(z.string()).default([]),
});

/** Mid-call: run the same rules engine on what the agent knows so far and tell it what to do next. */
export async function POST(req: Request) {
  return handleTool(req, async (s, { callId, callerPhone, args }) => {
    // Accept facts at the top level too, in case the agent flattens them.
    const parsed = Args.safeParse("facts" in args ? args : { facts: args, asked: (args as { asked?: unknown }).asked });
    if (!parsed.success) return { next_action: "book", question: null, say: null, note: "could not read facts; continue the normal flow" };
    const facts = emptyFacts({ ...stripNulls(parsed.data.facts), phone: normalisePhone(callerPhone) });
    const e = evaluate(facts, { now: new Date(), mode: "live", asked: parsed.data.asked });

    if (callId) {
      try {
        const existing = await s.repo.getCallByProviderId(callId);
        if (existing) await s.repo.updateCall(existing.id, { live_verdict: e.verdict });
        else await s.repo.upsertCall({
          provider_call_id: callId, lead_id: null, channel: "phone", caller_phone: callerPhone, started_at: new Date().toISOString(),
          ended_at: null, duration_sec: 0, status: "in_progress", transcript: null, recording_url: null, live_verdict: e.verdict,
          ring_sec: null, voice_cost_usd: 0, llm_cost_usd: 0, llm_input_tokens: 0, llm_output_tokens: 0,
          extraction_status: "pending", webhook_event_id: null, processed_at: null,
        });
      } catch (err) { logError("tools.evaluate.record", err, { callId }); }
    }
    return { next_action: e.next_action, question: e.question, say: e.say, verdict: e.verdict };
  });
}

function stripNulls<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}
