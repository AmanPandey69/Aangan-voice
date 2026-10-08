import type { Evaluation } from "@/lib/domain/lead";
import type { LeadRow, ReviewReason } from "@/lib/db/types";

/** Why a lead belongs in the dashboard's review queue (empty = no review needed). */
export function reviewReasons(lead: Pick<LeadRow, "booking_status" | "price_leak" | "extraction_failed" | "verdict_mismatch">, e: Evaluation | null): ReviewReason[] {
  const r = new Set<ReviewReason>();
  if (lead.extraction_failed) r.add("extraction_failed");
  if (lead.price_leak) r.add("price_leak");
  if (lead.verdict_mismatch) r.add("verdict_mismatch");
  if (lead.booking_status === "needs_manual_booking") r.add("needs_manual_booking");
  if (e) {
    if (e.verdict === "declined") r.add("declined");
    if (e.verdict === "escalate") r.add(e.escalation_reason === "budget_review" ? "budget_review" : "escalation");
    if (e.uncertainties.some((u) => /^(real_project|service_area|timeline):/.test(u))) r.add("unclear");
    if (e.flags.includes("small_commercial")) r.add("small_commercial");
    if (e.flags.includes("unknown_locality")) r.add("unknown_locality");
  }
  return [...r];
}
