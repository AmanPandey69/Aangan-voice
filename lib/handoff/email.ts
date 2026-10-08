import type { LeadRow } from "@/lib/db/types";
import type { LeadFacts } from "@/lib/domain/lead";
import { assertNoPriceLeak } from "@/lib/guard/price-guard";
import { displayPhone } from "@/lib/phone";

export type HandoffVariant = "booked" | "priority_booked" | "manual_booking" | "escalation" | "budget_review" | "reminder";

export interface HandoffEmailInput {
  lead: LeadRow;
  variant: HandoffVariant;
  bookedSlot: string | null;
  ackUrl: string;
  dashboardUrl: string;
  crmUrl?: string | null;
  /** For reminders: the subject of the original email. */
  originalSubject?: string;
  /**
   * Minimal body (contact details, slot and links only). Used as a fallback
   * if the full body trips the price guard, so the designer is never left
   * without a handoff because of a false positive.
   */
  minimal?: boolean;
}

export interface RenderedEmail { subject: string; html: string; text: string }

export function formatSlot(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }) + " IST";
}

const yesNo = (v: boolean | null | undefined) => (v == null ? "Not stated" : v ? "Yes" : "No");
const human = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : null);

export function propertyLabel(f: Partial<LeadFacts>): string {
  const parts = [f.bhk ? `${f.bhk}BHK` : null, human(f.property_type)].filter(Boolean);
  return parts.length ? parts.join(" ") : "property type not stated";
}

const ESCALATION_LABEL: Record<string, string> = {
  existing_client_complaint: "Existing client complaint",
  requested_human: "Caller asked for a person",
  abusive_caller: "Difficult caller",
  misunderstood_repeatedly: "Agent misunderstood the caller",
};

export function buildSubject(i: HandoffEmailInput): string {
  const f = i.lead.facts;
  const who = i.lead.name ?? "Caller";
  const where = i.lead.locality ?? "locality not stated";
  const what = propertyLabel(f);
  switch (i.variant) {
    case "booked": return `New consultation booked: ${who}, ${where}, ${what}`;
    case "priority_booked": return `URGENT · Priority consultation booked: ${who}, ${where}, ${what}`;
    case "manual_booking": return `URGENT · Needs manual booking: ${who}, ${where}, ${what}`;
    case "escalation": return `URGENT · Escalation (${ESCALATION_LABEL[i.lead.reason ?? ""] ?? "needs a person"}): ${who}, ${displayPhone(i.lead.phone)}`;
    case "budget_review": return `Review needed: ${who}, ${where}, ${what} (budget check)`;
    case "reminder": return `Reminder, please acknowledge: ${i.originalSubject ?? `${who}, ${where}`}`;
  }
}

function rows(i: HandoffEmailInput): [string, string][] {
  const l = i.lead;
  const f = l.facts;
  const slot = formatSlot(i.bookedSlot);
  const slotText = slot ?? (l.booking_status === "needs_manual_booking"
    ? `NOT BOOKED. Preferred time: ${l.preferred_time_raw ?? "not stated"}. Please call to book.` : "Not booked");
  if (i.minimal) {
    return [["Name", l.name ?? "Not stated"], ["Phone", displayPhone(l.phone)], ["Locality", l.locality ?? "Not stated"],
      ["Booked slot", slotText], ["Details", "See the dashboard for the full enquiry."]];
  }
  return [
    ["Verdict", `${l.verdict ?? "pending"}${l.urgent ? " (urgent)" : ""}`],
    ["Name", l.name ?? "Not stated"],
    ["Phone", displayPhone(l.phone)],
    ["Email", l.email ?? "Not stated"],
    ["Locality", l.locality ?? "Not stated"],
    ["Property type", propertyLabel(f)],
    ["Area", f.carpet_area_sqft ? `${f.carpet_area_sqft.toLocaleString("en-IN")} sq ft (approx.)` : "Not stated"],
    ["Scope", [human(f.scope_type), f.scope_rooms?.length ? `(${f.scope_rooms.join(", ")})` : null].filter(Boolean).join(" ") || "Not stated"],
    ["Property status", [human(f.property_status), f.rented ? "rented" : null].filter(Boolean).join(", ") || "Not stated"],
    ["Timeline", f.timeline_raw ?? "Not stated"],
    ["Decision-maker", [human(f.decision_maker), f.decision_maker_note ? `(${f.decision_maker_note})` : null].filter(Boolean).join(" ")],
    ["Referral", f.referral ?? f.source ?? "Not stated"],
    ["Asked about price", yesNo(f.price_asked)],
    ["Budget", f.budget_volunteered ? "Volunteered by the caller (see dashboard)" : "Not discussed"],
    ["Uncertainties", l.uncertainties.length ? l.uncertainties.join("; ") : "None"],
    ["Flags", l.flags.length ? l.flags.map(human).join(", ") : "None"],
    ["Booked slot", slotText],
    ["Summary", f.summary || "Not available"],
  ];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function intro(v: HandoffVariant): string {
  switch (v) {
    case "booked": return "A new consultation has been booked by the phone assistant.";
    case "priority_booked": return "A priority (large) project has booked a consultation.";
    case "manual_booking": return "This caller qualified, but the consultation could not be booked during the call. Please call them to book.";
    case "escalation": return "This call needs a person, urgently. Please call back as soon as possible.";
    case "budget_review": return "The caller volunteered a budget that may not match the scope. The assistant did not book. Please review and decide whether to follow up.";
    case "reminder": return "This handoff has not been acknowledged yet.";
  }
}

export function buildHandoffEmail(i: HandoffEmailInput): RenderedEmail {
  const subject = buildSubject(i);
  const r = rows(i);
  const urgent = i.variant !== "booked";

  const text = [
    intro(i.variant),
    "",
    ...r.map(([k, v]) => `${k}: ${v}`),
    "",
    `Open in dashboard: ${i.dashboardUrl}`,
    i.crmUrl ? `HubSpot deal: ${i.crmUrl}` : null,
    "",
    `Acknowledge (confirms you have seen this): ${i.ackUrl}`,
  ].filter((x) => x !== null).join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2722">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="padding:20px 24px;background:${urgent ? "#9b2c1f" : "#5b4a36"};color:#fff">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Aangan Studio · ${urgent ? "Action needed" : "New consultation"}</div>
<div style="font-size:18px;font-weight:600;margin-top:4px">${esc(subject)}</div></td></tr>
<tr><td style="padding:18px 24px 6px;font-size:15px;line-height:1.5">${esc(intro(i.variant))}</td></tr>
<tr><td style="padding:6px 24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.45">
${r.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#7a6f63;vertical-align:top;white-space:nowrap;width:150px">${esc(k)}</td><td style="padding:6px 0;vertical-align:top">${esc(v)}</td></tr>`).join("\n")}
</table></td></tr>
<tr><td style="padding:8px 24px 24px">
<a href="${esc(i.ackUrl)}" style="display:inline-block;background:#2f6b4f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Acknowledge</a>
<a href="${esc(i.dashboardUrl)}" style="display:inline-block;margin-left:10px;color:#5b4a36;padding:12px 4px">Open in dashboard</a>
${i.crmUrl ? `<a href="${esc(i.crmUrl)}" style="display:inline-block;margin-left:10px;color:#5b4a36;padding:12px 4px">HubSpot deal</a>` : ""}
</td></tr></table>
<div style="font-size:12px;color:#9a9086;padding:12px">Sent by the Aangan Studio call assistant. Recordings and personal data are in the dashboard; please don't forward this email outside the studio.</div>
</td></tr></table></body></html>`;

  for (const [part, content] of [["subject", subject], ["text", text], ["html", html]] as const) assertNoPriceLeak(content, `email ${part}`);
  return { subject, html, text };
}
