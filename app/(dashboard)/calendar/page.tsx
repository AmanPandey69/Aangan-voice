import Link from "next/link";
import { services } from "@/lib/container";
import { Hero } from "@/app/ui";
import { MEDIA } from "@/config/media";
import { propertyLabel } from "@/lib/handoff/email";
import { MonthGrid, type CalEvent } from "./month";

export const dynamic = "force-dynamic";
const TZ = "Asia/Kolkata";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const [y, mo] = (m && /^\d{4}-\d{2}$/.test(m) ? m : todayKey.slice(0, 7)).split("-").map(Number);
  const year = y, month = mo - 1;
  const from = new Date(Date.UTC(year, month, 1) - 7 * 864e5).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 1) + 14 * 864e5).toISOString();

  const s = services();
  const [bookings, leads] = await Promise.all([s.repo.listBookings(from, to), s.repo.listLeads({ since: from, limit: 2000 })]);
  const allLeads = new Map((await s.repo.listLeads({ limit: 2000 })).map((l) => [l.id, l]));
  const events: CalEvent[] = bookings.map((b) => {
    const l = b.lead_id ? allLeads.get(b.lead_id) : undefined;
    return { id: b.id, start: b.start_at, leadId: b.lead_id, name: l?.name ?? "Consultation",
      sub: l ? [l.locality, propertyLabel(l.facts)].filter(Boolean).join(" · ") : "Booked directly in Cal.com" };
  });
  const newByDay: Record<string, number> = {};
  for (const l of leads) { const k = new Date(l.first_seen_at).toLocaleDateString("en-CA", { timeZone: TZ }); newByDay[k] = (newByDay[k] ?? 0) + 1; }

  const label = new Date(Date.UTC(year, month, 15)).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const shift = (n: number) => { const d = new Date(Date.UTC(year, month + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const monthEvents = events.filter((e) => e.start.slice(0, 7) === `${year}-${String(month + 1).padStart(2, "0")}`).length;

  return (
    <>
      <Hero compact image={MEDIA.heroReview} eyebrow="Schedule" title="Calendar" subtitle="Every booked consultation, plus how many new enquiries came in each day."
        stats={[{ label: "consultations this month", value: monthEvents }]} />
      <div className="cal-head rise" style={{ ["--i" as string]: 1 }}>
        <h2>{label}</h2>
        <div className="actions">
          <Link className="act" href={`/calendar?m=${shift(-1)}`}>← Prev</Link>
          <Link className="act" href="/calendar">Today</Link>
          <Link className="act" href={`/calendar?m=${shift(1)}`}>Next →</Link>
        </div>
      </div>
      <MonthGrid key={`${year}-${month}`} year={year} month={month} events={events} newByDay={newByDay} todayKey={todayKey} />
    </>
  );
}
