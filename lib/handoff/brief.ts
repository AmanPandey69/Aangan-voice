import type { LeadRow } from "@/lib/db/types";
import { hasRealPhone } from "@/lib/phone";
import { formatSlot, propertyLabel } from "./email";

/**
 * Consultation prep for designers: what to ask, derived from what the call
 * didn't settle, plus one-tap links. No prices, ever.
 */
export function prepQuestions(lead: LeadRow): string[] {
  const f = lead.facts;
  const c = lead.criteria;
  const q: string[] = [];
  if (lead.flags.includes("handle_with_care")) q.push("They were frustrated about an earlier follow-up. Open with a quick apology.");
  if (c?.real_project.status === "unclear") q.push("Confirm they want design and execution, not only ideas or advice.");
  if (c?.service_area.status === "unclear") q.push(`Confirm the exact address is within Pune or PCMC${lead.locality ? ` (they said “${lead.locality}”)` : ""}.`);
  if (c?.timeline.status === "unclear") q.push("Ask when they need it finished, and when the site will be available.");
  if (c?.decision_maker.status === "unclear") q.push("Check who makes the final decision, and whether they'll join the consultation.");
  if (f.budget_volunteered && f.budget_concern) q.push("They mentioned a budget that may not fit the scope. Talk through expectations gently.");
  if (f.price_asked) q.push("They asked about cost. Be ready to walk through how pricing works.");
  if (f.rented) q.push("Rented home: keep it to reversible work and confirm the landlord is on board.");
  if (f.structural_changes_requested) q.push("They mentioned structural changes. Explain the studio doesn't move walls.");
  if (lead.flags.includes("priority")) q.push("Large project. Consider a site visit with the principal designer.");
  if (f.referral) q.push(`Referred by ${f.referral}. Thank them for the introduction.`);
  if (!f.scope_rooms?.length) q.push("Walk through which rooms are in scope.");
  return q.length ? q : ["Everything important was covered on the call. Start with their style and must-haves."];
}

const digits = (p: string) => p.replace(/\D/g, "");

export function telHref(lead: LeadRow): string | null {
  return hasRealPhone(lead.phone) ? `tel:${lead.phone}` : null;
}

export function whatsappHref(lead: LeadRow): string | null {
  if (!hasRealPhone(lead.phone)) return null;
  const first = (lead.name ?? "").split(" ")[0];
  const slot = formatSlot(lead.booked_slot);
  const msg = slot
    ? `Hi${first ? ` ${first}` : ""}, this is your designer from Aangan Studio. Looking forward to our consultation on ${slot}. Anything you'd like me to prepare beforehand?`
    : `Hi${first ? ` ${first}` : ""}, this is your designer from Aangan Studio, following up on your call. When would be a good time to fix your design consultation?`;
  return `https://wa.me/${digits(lead.phone)}?text=${encodeURIComponent(msg)}`;
}

const gcalDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarHref(lead: LeadRow, dashboardUrl: string): string | null {
  if (!lead.booked_slot) return null;
  const start = lead.booked_slot;
  const end = new Date(Date.parse(start) + 60 * 60_000).toISOString();
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Aangan consultation: ${lead.name ?? "client"}${lead.locality ? `, ${lead.locality}` : ""}`,
    dates: `${gcalDate(start)}/${gcalDate(end)}`,
    details: `${lead.facts.summary ?? ""}\n\nPhone: ${hasRealPhone(lead.phone) ? lead.phone : "not captured"}\n${dashboardUrl}`,
    location: lead.locality ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Plain-text brief a designer can paste into notes or a chat. */
export function briefText(lead: LeadRow, dashboardUrl: string): string {
  const f = lead.facts;
  return [
    `${lead.name ?? "Client"}: ${[lead.locality, propertyLabel(f), f.carpet_area_sqft ? `${f.carpet_area_sqft} sq ft` : null].filter(Boolean).join(", ")}`,
    f.summary ? `Summary: ${f.summary}` : null,
    lead.booked_slot ? `Consultation: ${formatSlot(lead.booked_slot)}` : "Consultation: not booked yet",
    f.timeline_raw ? `Timeline: ${f.timeline_raw}` : null,
    `Phone: ${hasRealPhone(lead.phone) ? lead.phone : "not captured"}`,
    "",
    "Ask at the consultation:",
    ...prepQuestions(lead).map((x) => `• ${x}`),
    "",
    dashboardUrl,
  ].filter((x) => x !== null).join("\n");
}
