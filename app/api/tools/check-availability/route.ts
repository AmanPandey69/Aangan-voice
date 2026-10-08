import { z } from "zod";
import { handleTool } from "@/lib/http/tools";
import { formatSlot } from "@/lib/handoff/email";
import { logError } from "@/lib/http/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const TZ = "Asia/Kolkata";
const Args = z.object({ from: z.string().optional(), to: z.string().optional() });

/** Mid-call: next open consultation slots, worded for speech. */
export async function POST(req: Request) {
  return handleTool(req, async (s, { callId, args }) => {
    const a = Args.safeParse(args);
    const from = a.success && a.data.from && !Number.isNaN(Date.parse(a.data.from)) ? new Date(a.data.from) : new Date(Date.now() + 2 * 3600_000);
    const to = a.success && a.data.to && !Number.isNaN(Date.parse(a.data.to)) ? new Date(a.data.to) : new Date(from.getTime() + 7 * 864e5);
    try {
      const slots = (await s.calendar.getAvailability(from.toISOString(), to.toISOString(), TZ)).slice(0, 6);
      if (!slots.length) return { ok: true, slots: [], say: "I don't see an open slot in the next few days. I'll ask the team to call you to fix a time." };
      return { ok: true, slots: slots.map((sl) => ({ start: sl.start, spoken: formatSlot(sl.start) })) };
    } catch (err) {
      logError("tools.check-availability", err, { callId });
      return { ok: false, slots: [], say: "I'm having trouble reaching the calendar right now. Could you tell me which day and time suits you, and the team will confirm it by phone today?" };
    }
  });
}
