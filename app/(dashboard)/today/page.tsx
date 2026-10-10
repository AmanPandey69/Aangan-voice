import Link from "next/link";
import { services } from "@/lib/container";
import { roomPhoto } from "@/config/media";
import { propertyLabel } from "@/lib/handoff/email";
import { telHref } from "@/lib/handoff/brief";
import type { BookingRow, CallRow, LeadRow, ReviewReason } from "@/lib/db/types";
import { fitScore, glance, needsFollowUp, pulse, type Glance, type Pulse } from "@/lib/insights";
import { ScoreRing } from "@/app/ui";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dayLabel = (iso: string) => {
  const d = istDay(new Date(iso)), today = istDay(new Date()), tomorrow = istDay(new Date(Date.now() + 864e5));
  return d === today ? "Today" : d === tomorrow ? "Tomorrow" : new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
};
const whenPhrase = (iso: string) => {
  const d = dayLabel(iso);
  return `${d === "Today" || d === "Tomorrow" ? d.toLowerCase() : `on ${d}`} at ${time(iso)}`;
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const NEED_TEXT: Partial<Record<ReviewReason, [string, string]>> = {
  escalation: ["Wants a person", "#e76f51"],
  needs_manual_booking: ["Call to book a slot", "#1793FF"],
  unacknowledged_handoff: ["Handoff not acknowledged", "#d97706"],
  budget_review: ["Budget check", "#d97706"],
  extraction_failed: ["Read the transcript", "#6b8682"],
  verdict_mismatch: ["Double-check the verdict", "#6b8682"],
  price_leak: ["Agent may have said a price", "#e76f51"],
};
const PRIORITY: ReviewReason[] = ["escalation", "needs_manual_booking", "unacknowledged_handoff", "budget_review", "price_leak", "extraction_failed", "verdict_mismatch"];


export default async function TodayPage() {
  const s = services();
  const now = new Date();
  const since = new Date(now.getTime() - 31 * 864e5).toISOString();
  const [bookings, leads, calls, notifications] = await Promise.all([
    s.repo.listBookings(new Date(now.getTime() - 2 * 3600e3).toISOString(), new Date(now.getTime() + 14 * 864e5).toISOString()),
    s.repo.listLeads({ limit: 500 }),
    s.repo.listCalls({ since, limit: 2000 }),
    s.repo.listNotifications({ since }),
  ]);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const g = glance(calls, leads, now);
  const p = pulse(calls, leads, notifications, now);
  const next = bookings.find((b) => Date.parse(b.start_at) > now.getTime() - 3600e3);
  const nextLead = next?.lead_id ? byId.get(next.lead_id) : undefined;
  const recentCalls = [...calls].filter((c) => c.status !== "in_progress").sort((a, b) => Date.parse(b.started_at ?? b.created_at) - Date.parse(a.started_at ?? a.created_at)).slice(0, 4);

  // One "to do" list: open review items first, then good leads with no consultation.
  const todo = [
    ...leads.filter((l) => !l.review_resolved_at && l.review_reasons.some((r) => NEED_TEXT[r]))
      .map((l) => { const r = PRIORITY.find((p) => l.review_reasons.includes(p))!; return { l, text: NEED_TEXT[r]![0], color: NEED_TEXT[r]![1], rank: PRIORITY.indexOf(r) }; }),
    ...leads.filter((l) => needsFollowUp(l) && !(!l.review_resolved_at && l.review_reasons.some((r) => NEED_TEXT[r])))
      .map((l) => ({ l, text: "Qualified, no consultation yet", color: "#1793FF", rank: 99 })),
  ].sort((a, b) => a.rank - b.rank);

  return (
    <>
      <section className="home">
        <div className="home-text rise">
          <div className="home-date">{now.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })}</div>
          <h1>Hello, <em>designer.</em></h1>
          {next ? (
            <div className="next-card">
              <span className="next-thumb" style={{ backgroundImage: `url("${roomPhoto(nextLead?.id ?? next.id, 300)}")` }} aria-hidden="true" />
              <div className="next-body">
                <small>Next consultation · {until(next.start_at)}</small>
                <b>{nextLead?.name ?? "Consultation"}</b>
                <span>{[whenPhrase(next.start_at), nextLead?.locality, nextLead ? propertyLabel(nextLead.facts) : null].filter(Boolean).join(" · ")}</span>
              </div>
              {nextLead && <Link className="act primary" href={`/calls/${nextLead.id}`}>Prep <span className="arrow">→</span></Link>}
            </div>
          ) : <p className="home-sub">No consultations booked yet. New bookings appear here the moment a caller books.</p>}
          <div className="actions">
            <Link className="act" href="/calendar">Calendar</Link>
            <Link className="act" href="/calls?show=followup">↻ Follow up</Link>
            <Link className="act" href="/calls">All enquiries</Link>
          </div>
        </div>
        <CallLog calls={recentCalls} byId={byId} />
      </section>

      <StudioPulse p={p} />

      <div className="home-lists">
        <section className="panel reveal">
          <div className="panel-head"><h2>Coming up</h2><Link href="/calendar">Calendar <span className="arrow">→</span></Link></div>
          <WeekStrip now={now} bookings={bookings} />
          {bookings.length === 0 ? <p className="muted">Nothing booked yet.</p> : bookings.slice(0, 4).map((b) => {
            const l = b.lead_id ? byId.get(b.lead_id) : undefined;
            return (
              <Link key={b.id} href={l ? `/calls/${l.id}` : "/calendar"} className="row">
                <span className="thumb" style={{ backgroundImage: `url("${roomPhoto(l?.id ?? b.id, 200)}")` }} aria-hidden="true" />
                <span className="row-main"><b>{l?.name ?? "Consultation"}</b><small>{[l?.locality, l ? propertyLabel(l.facts) : "Booked in Cal.com"].filter(Boolean).join(" · ")}</small></span>
                <span className="row-when"><b>{time(b.start_at)}</b><small>{dayLabel(b.start_at)}</small></span>
              </Link>
            );
          })}
        </section>
        <section className="panel reveal" style={{ transitionDelay: "80ms" }}>
          <div className="panel-head"><h2>Needs you <span className="count">{todo.length}</span></h2><Link href="/review">Review queue <span className="arrow">→</span></Link></div>
          {todo.length === 0 ? <p className="muted">All clear. Nothing needs a person right now.</p> : todo.slice(0, 5).map(({ l, text, color }) => {
            const tel = telHref(l);
            return (
              <div key={l.id} className="row">
                <ScoreRing score={fitScore(l.criteria)} size={40} />
                <Link href={`/calls/${l.id}`} className="row-main"><b>{l.name ?? "Unknown caller"}</b><small><i className="dot" style={{ background: color }} />{text}{l.locality ? ` · ${l.locality}` : ""}</small></Link>
                {tel ? <a className="act" href={tel}>📞 Call</a> : <Link className="act" href={`/calls/${l.id}`}>Open</Link>}
              </div>
            );
          })}
        </section>
      </div>

      <div className="section-title reveal"><h2>Last 30 days</h2><Link href="/costs">Costs <span className="arrow">→</span></Link></div>
      <AtAGlance g={g} />
    </>
  );
}

const fmtDur = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
const until = (iso: string) => {
  const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
  return m <= 0 ? "now" : m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.round(m / 60)} h` : `in ${Math.round(m / 1440)} days`;
};
/** A stable, call-specific waveform (decorative). */
function waveform(id: string, n = 28) {
  let h = 7;
  return Array.from({ length: n }, (_, i) => { for (const ch of id + i) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 0.2 + ((h % 1000) / 1000) * 0.8; });
}

/** The last few calls as a log, each with its own waveform; the newest one moves. */
function CallLog({ calls, byId }: { calls: CallRow[]; byId: Map<string, LeadRow> }) {
  return (
    <section className="call-log rise" style={{ ["--i" as string]: 2 }}>
      <div className="call-log-head"><span className="live-dot" />Call log<Link href="/calls">All <span className="arrow">→</span></Link></div>
      {calls.length === 0 ? <p className="muted">No calls yet.</p> : calls.map((c, i) => {
        const l = c.lead_id ? byId.get(c.lead_id) : undefined;
        return (
          <Link key={c.id} href={l ? `/calls/${l.id}` : "/calls"} className={`log-row${i === 0 ? " latest" : ""}`}>
            <span className="log-top">
              <b>{l?.name ?? "Unknown caller"}</b>
              <span className={`badge badge-${l?.verdict ?? "pending"}`}>{l?.verdict ?? "pending"}</span>
              <small>{ago(c.started_at ?? c.created_at)}</small>
            </span>
            <span className="log-wave" aria-hidden="true">{waveform(c.id).map((v, k) => <i key={k} style={{ ["--v" as string]: v, animationDelay: `${-k * 0.07}s` }} />)}</span>
            <span className="log-meta"><span>{fmtDur(c.duration_sec)}</span><span>{l?.locality ?? "Area not stated"}</span></span>
          </Link>
        );
      })}
    </section>
  );
}

/** Six numbers about how the studio runs, not just how many people called. */
function StudioPulse({ p }: { p: Pulse }) {
  const hour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
  const items: [string, string, string][] = [
    ["Average call", p.avgCallSec == null ? "–" : fmtDur(p.avgCallSec), "minutes on the phone"],
    ["Brief to designer", p.handoffMin == null ? "–" : p.handoffMin < 1 ? "< 1 min" : `${Math.round(p.handoffMin)} min`, "after the call ends"],
    ["Acknowledged", p.ackRate == null ? "–" : `${Math.round(p.ackRate * 100)}%`, "of handoff emails"],
    ["Top area", p.topArea?.name ?? "–", p.topArea ? `${p.topArea.count} enquir${p.topArea.count === 1 ? "y" : "ies"}` : "no areas yet"],
    ["Busiest time", p.busiestHour == null ? "–" : `${hour(p.busiestHour)}–${hour((p.busiestHour + 1) % 24)}`, "most calls come in"],
    ["Called back", String(p.repeatCallers), p.repeatCallers === 1 ? "person called again" : "people called again"],
  ];
  return (
    <section className="pulse reveal" aria-label="Studio pulse, last 30 days">
      <div className="pulse-label">Studio pulse<small>last 30 days</small></div>
      {items.map(([k, v, sub]) => <div className="pulse-item" key={k}><small>{k}</small><b>{v}</b><span>{sub}</span></div>)}
    </section>
  );
}

/** Seven days from today, with a dot for each consultation. */
function WeekStrip({ now, bookings }: { now: Date; bookings: BookingRow[] }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * 864e5));
  const count = (d: Date) => bookings.filter((b) => istDay(new Date(b.start_at)) === istDay(d)).length;
  return (
    <div className="week">
      {days.map((d, i) => {
        const n = count(d);
        return (
          <div key={i} className={`week-day${i === 0 ? " today" : ""}${n ? " has" : ""}`}>
            <small>{d.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short" })}</small>
            <b>{d.toLocaleDateString("en-IN", { timeZone: TZ, day: "numeric" })}</b>
            <span>{Array.from({ length: Math.min(n, 3) }, (_, k) => <i key={k} />)}</span>
          </div>
        );
      })}
    </div>
  );
}

const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);

/** Four quiet numbers: volume, after-hours share, booking rate, and proof that no price was ever quoted. */
function AtAGlance({ g }: { g: Glance }) {
  const max = Math.max(1, ...g.perDay.map((d) => d.count));
  const fmt = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return (
    <div className="glance reveal">
      <div className="glance-card wide">
        <div className="tile-label">Calls per day</div>
        <div className="glance-big">{g.calls}<small> calls · {g.people} {g.people === 1 ? "person" : "people"}</small></div>
        <div className="bars" role="img" aria-label={`Calls per day over the last 30 days, ${g.calls} in total`}>
          {g.perDay.map((d) => <i key={d.day} style={{ ["--h" as string]: d.count / max }} title={`${fmt(d.day)}: ${d.count}`} />)}
        </div>
        <div className="bars-axis"><span>{fmt(g.perDay[0].day)}</span><span>Today</span></div>
      </div>
      <div className="glance-card">
        <div className="tile-label">Booked on the call</div>
        <div className="glance-big">{pct(g.bookingRate)}</div>
        <p>{g.qualified ? `${g.booked} of ${g.qualified} qualified callers booked a consultation without a call back.` : "No qualified callers yet."}</p>
      </div>
      <div className="glance-card">
        <div className="tile-label">After studio hours</div>
        <div className="glance-big">{pct(g.afterHoursRate)}</div>
        <p>of calls came outside 10am–7pm, Mon–Sat. Answered anyway.</p>
      </div>
      <div className={`glance-card${g.priceLeaks ? " alert" : ""}`}>
        <div className="tile-label">Price questions</div>
        <div className="glance-big">{g.priceAsked}<small> asked · {g.priceLeaks} quoted</small></div>
        <p>{g.priceLeaks ? <Link href="/review">Check {g.priceLeaks} call{g.priceLeaks > 1 ? "s" : ""} in the review queue →</Link>
          : g.priceAsked ? "Every one was steered to the consultation. No number was ever said."
          : "Nobody asked yet. If they do, the assistant offers the consultation, never a number."}</p>
      </div>
    </div>
  );
}
