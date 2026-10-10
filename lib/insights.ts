import type { CallRow, LeadRow } from "@/lib/db/types";

/** Studio hours used for "after hours": Mon–Sat, 10am–7pm IST. */
const OPEN_HOUR = 10, CLOSE_HOUR = 19;
const TZ = "Asia/Kolkata";
const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/**
 * Fit score, 0–100: how many of the five qualification criteria the caller met
 * (pass = full marks, unclear = half). A reading aid for designers, never shown to callers.
 */
export function fitScore(criteria: LeadRow["criteria"]): number | null {
  const all = criteria ? Object.values(criteria) : [];
  if (all.length === 0) return null;
  const pts = all.reduce((s, c) => s + (c.status === "pass" ? 1 : c.status === "unclear" ? 0.5 : 0), 0);
  return Math.round((pts / all.length) * 100);
}

/** A good lead that didn't end up with a consultation: worth a call back. */
export const needsFollowUp = (l: Pick<LeadRow, "verdict" | "booking_status">) =>
  (l.verdict === "qualified" || l.verdict === "escalate") && l.booking_status !== "booked";

export function isAfterHours(iso: string): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const day = parts.find((p) => p.type === "weekday")?.value;
  return day === "Sun" || hour < OPEN_HOUR || hour >= CLOSE_HOUR;
}

export interface Glance {
  calls: number;
  people: number;
  perDay: { day: string; count: number }[];
  afterHoursRate: number | null;
  qualified: number;
  booked: number;
  bookingRate: number | null;
  priceAsked: number;
  priceLeaks: number;
}

/** The studio's last `days` days at a glance. Counts only; no money figures. */
export function glance(calls: CallRow[], leads: LeadRow[], now = new Date(), days = 30): Glance {
  const since = now.getTime() - days * 864e5;
  const recentCalls = calls.filter((c) => Date.parse(c.started_at ?? c.created_at) >= since && c.status !== "in_progress");
  const recentLeads = leads.filter((l) => Date.parse(l.last_call_at) >= since);
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) counts.set(istDay(new Date(now.getTime() - i * 864e5)), 0);
  for (const c of recentCalls) {
    const k = istDay(new Date(c.started_at ?? c.created_at));
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  const qualified = recentLeads.filter((l) => l.verdict === "qualified");
  const booked = qualified.filter((l) => l.booking_status === "booked").length;
  return {
    calls: recentCalls.length,
    people: recentLeads.length,
    perDay: [...counts].map(([day, count]) => ({ day, count })),
    afterHoursRate: recentCalls.length ? recentCalls.filter((c) => isAfterHours(c.started_at ?? c.created_at)).length / recentCalls.length : null,
    qualified: qualified.length,
    booked,
    bookingRate: qualified.length ? booked / qualified.length : null,
    priceAsked: recentLeads.filter((l) => l.facts.price_asked || l.flags.includes("price_asked")).length,
    priceLeaks: recentLeads.filter((l) => l.price_leak).length,
  };
}
