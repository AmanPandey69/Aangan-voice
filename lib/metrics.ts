import { COSTS } from "@/config/costs";
import type { CallRow, LeadRow, NotificationRow } from "@/lib/db/types";

export interface CostMetrics {
  calls: number;
  answered: number;
  missed: number;
  minutes: number;
  voiceUsd: number;
  llmUsd: number;
  emails: number;
  emailUsd: number;
  totalUsd: number;
  costPerCallUsd: number | null;
  qualified: number;
  booked: number;
  costPerQualifiedUsd: number | null;
  answerRate: number | null;
  avgTimeToAnswerSec: number | null;
  qualifiedToBookedRate: number | null;
  verdicts: Record<string, number>;
}

/** Cost and funnel numbers for the cost panel. Vendor costs only; never studio pricing. */
export function computeMetrics(calls: CallRow[], leads: LeadRow[], notifications: NotificationRow[]): CostMetrics {
  const finished = calls.filter((c) => c.status !== "in_progress");
  const missed = finished.filter((c) => c.status === "missed").length;
  const answered = finished.length - missed;
  const minutes = finished.reduce((s, c) => s + c.duration_sec, 0) / 60;
  const voiceReported = finished.reduce((s, c) => s + Number(c.voice_cost_usd || 0), 0);
  const voiceUsd = voiceReported > 0 ? voiceReported : minutes * COSTS.voiceUsdPerMinute;
  const llmUsd = finished.reduce((s, c) => s + Number(c.llm_cost_usd || 0), 0);
  const sent = notifications.filter((n) => n.sent_at);
  const emailUsd = sent.length * COSTS.emailUsdEach;
  const totalUsd = voiceUsd + llmUsd + emailUsd;
  const qualifiedLeads = leads.filter((l) => l.verdict === "qualified");
  const booked = qualifiedLeads.filter((l) => l.booking_status === "booked").length;
  const rings = finished.map((c) => c.ring_sec).filter((r): r is number => r != null);
  const verdicts: Record<string, number> = { qualified: 0, declined: 0, escalate: 0, pending: 0 };
  for (const l of leads) verdicts[l.verdict ?? "pending"]++;
  return {
    calls: finished.length, answered, missed, minutes, voiceUsd, llmUsd, emails: sent.length, emailUsd, totalUsd,
    costPerCallUsd: finished.length ? totalUsd / finished.length : null,
    qualified: qualifiedLeads.length, booked,
    costPerQualifiedUsd: qualifiedLeads.length ? totalUsd / qualifiedLeads.length : null,
    answerRate: finished.length ? answered / finished.length : null,
    avgTimeToAnswerSec: rings.length ? rings.reduce((a, b) => a + b, 0) / rings.length : null,
    qualifiedToBookedRate: qualifiedLeads.length ? booked / qualifiedLeads.length : null,
    verdicts,
  };
}
