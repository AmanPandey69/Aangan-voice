import { DEFAULT_RULES, type RulesConfig } from "@/config/rules";
import type { Services } from "@/lib/container";
import type { LeadRow, NotificationKind, NotificationRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { makeAckToken } from "@/lib/handoff/ack-token";
import { buildHandoffEmail, type HandoffEmailInput, type HandoffVariant, type RenderedEmail } from "@/lib/handoff/email";
import { PriceLeakError } from "@/lib/guard/price-guard";
import { logError } from "@/lib/http/respond";
import { isEmailTestNumber } from "@/lib/phone";
import { routeLead } from "@/lib/handoff/routing";

const KIND: Record<HandoffVariant, NotificationKind> = {
  booked: "handoff", priority_booked: "urgent", manual_booking: "manual_booking",
  escalation: "urgent", budget_review: "handoff", reminder: "reminder",
};

export const dashboardLeadUrl = (leadId: string) => `${env.appBaseUrl}/calls/${leadId}`;
export const ackUrl = (notificationId: string) => `${env.appBaseUrl}/api/ack?token=${encodeURIComponent(makeAckToken(notificationId))}`;

/** Which email (if any) a processed lead should trigger right now. */
export function chooseVariant(lead: LeadRow): HandoffVariant | null {
  if (!lead.verdict) return null; // post-call processing hasn't happened yet
  if (lead.verdict === "escalate") return lead.reason === "budget_review" ? "budget_review" : "escalation";
  if (lead.verdict !== "qualified") return null;
  if (lead.booking_status === "booked" && lead.booked_slot) return lead.flags.includes("priority") ? "priority_booked" : "booked";
  if (lead.booking_status === "needs_manual_booking") return "manual_booking";
  return null;
}

/** Send whatever handoff the lead currently warrants, at most once per (lead, variant, slot). */
export async function notifyForLead(s: Services, leadId: string): Promise<NotificationRow | null> {
  const lead = await s.repo.getLead(leadId);
  if (!lead) return null;
  const variant = chooseVariant(lead);
  if (!variant) return null;
  const dedupeKey = `${lead.id}:${variant}:${lead.booked_slot ?? "-"}`;
  return sendEmail(s, lead, variant, dedupeKey);
}

export async function sendEmail(s: Services, lead: LeadRow, variant: HandoffVariant, dedupeKey: string, original?: NotificationRow): Promise<NotificationRow | null> {
  const existing = (await s.repo.listNotifications({ leadId: lead.id })).find((n) => n.dedupe_key === dedupeKey);
  if (existing && existing.status !== "failed" && existing.status !== "queued") return existing;

  const route = routeLead(lead);
  if (!route) throw new Error("DESIGNER_EMAIL is not set; cannot send handoff");

  const draft = render({ lead, variant, bookedSlot: lead.booked_slot, ackUrl: "https://placeholder", dashboardUrl: dashboardLeadUrl(lead.id), originalSubject: original?.subject });
  const row = existing ?? await s.repo.insertNotification({
    lead_id: lead.id, kind: KIND[variant], variant, dedupe_key: dedupeKey, recipient: route.to, cc: route.cc,
    subject: draft.subject, provider: s.notifier.name, provider_id: null, status: "queued", error: null,
    sent_at: null, delivered_at: null, opened_at: null, acknowledged_at: null, reminder_sent_at: null, flagged_unacknowledged_at: null,
  });

  // The Acknowledge link always points at the email being acknowledged (the original, for reminders).
  const email = render({
    lead, variant, bookedSlot: lead.booked_slot, ackUrl: ackUrl(original?.id ?? row.id),
    dashboardUrl: dashboardLeadUrl(lead.id), crmUrl: lead.hubspot_deal_id ? s.crm.dealUrl(lead.hubspot_deal_id) : null,
    originalSubject: original?.subject,
  });

  try {
    const { providerId } = await s.notifier.send({
      to: route.to, cc: route.cc, subject: email.subject, html: email.html, text: email.text,
      idempotencyKey: dedupeKey, tags: { kind: KIND[variant], variant },
    });
    return s.repo.updateNotification(row.id, { provider_id: providerId, status: "sent", sent_at: new Date().toISOString(), error: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await s.repo.updateNotification(row.id, { status: msg.startsWith("Price-like") ? "blocked" : "failed", error: msg });
    throw err;
  }
}

/** Reminder after N minutes without acknowledgement; dashboard flag after M. */
export async function processAckReminders(s: Services, now = new Date(), rules: RulesConfig = DEFAULT_RULES) {
  const reminderCutoff = new Date(now.getTime() - rules.ackReminderAfterMinutes * 60_000).toISOString();
  const flagCutoff = new Date(now.getTime() - rules.ackFlagAfterMinutes * 60_000).toISOString();
  let reminders = 0, flagged = 0;

  for (const n of await s.repo.listUnacknowledged(reminderCutoff)) {
    if (!n.lead_id) continue;
    const lead = await s.repo.getLead(n.lead_id);
    if (!lead) continue;
    if (!n.reminder_sent_at) {
      await sendEmail(s, lead, "reminder", `${n.dedupe_key}:reminder`, n);
      await s.repo.updateNotification(n.id, { reminder_sent_at: now.toISOString() });
      reminders++;
    }
    if (!n.flagged_unacknowledged_at && n.sent_at && n.sent_at <= flagCutoff) {
      await s.repo.updateNotification(n.id, { flagged_unacknowledged_at: now.toISOString() });
      if (!lead.review_reasons.includes("unacknowledged_handoff")) {
        await s.repo.updateLead(lead.id, { review_reasons: [...lead.review_reasons, "unacknowledged_handoff"], review_resolved_at: null });
      }
      flagged++;
    }
  }
  return { reminders, flagged };
}

/** Full email, or the minimal version if the full one trips the price guard. Throws only if both do. */
function render(input: HandoffEmailInput): RenderedEmail {
  let email: RenderedEmail;
  try {
    email = buildHandoffEmail(input);
  } catch (err) {
    if (!(err instanceof PriceLeakError)) throw err;
    logError("email.price_guard_fallback", err, { lead: input.lead.id });
    email = buildHandoffEmail({ ...input, minimal: true });
  }
  // Smoke-test emails are clearly marked so nobody acts on them.
  return isEmailTestNumber(input.lead.phone) ? { ...email, subject: `[TEST] ${email.subject}` } : email;
}
