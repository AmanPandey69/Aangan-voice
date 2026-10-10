"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth/session";
import { services } from "@/lib/container";

export async function resolveReview(leadId: string) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("unauthorised");
  await services().repo.updateLead(leadId, { review_resolved_at: new Date().toISOString() });
  revalidatePath(`/calls/${leadId}`);
  revalidatePath("/review");
}

/** Acknowledge every sent handoff for this lead from the dashboard (same effect as the email button). */
export async function acknowledgeLead(leadId: string) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) throw new Error("unauthorised");
  const { repo } = services();
  const at = new Date().toISOString();
  for (const n of await repo.listNotifications({ leadId })) {
    if (n.kind !== "reminder" && n.sent_at && !n.acknowledged_at) await repo.updateNotification(n.id, { acknowledged_at: at });
  }
  const lead = await repo.getLead(leadId);
  if (lead?.review_reasons.includes("unacknowledged_handoff")) {
    await repo.updateLead(leadId, { review_reasons: lead.review_reasons.filter((r) => r !== "unacknowledged_handoff") });
  }
  revalidatePath(`/calls/${leadId}`);
  revalidatePath("/today");
}
