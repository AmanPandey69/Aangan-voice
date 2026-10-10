import Link from "next/link";
import { services } from "@/lib/container";
import { MEDIA, roomPhoto } from "@/config/media";
import { CountUp } from "@/app/fx/count-up";
import { propertyLabel } from "@/lib/handoff/email";
import { telHref } from "@/lib/handoff/brief";
import type { BookingRow, CallRow, LeadRow, ReviewReason } from "@/lib/db/types";
import { fitScore, glance, needsFollowUp, type Glance } from "@/lib/insights";
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
const ICON = {
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  cal: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
};
const Ico = ({ d }: { d: keyof typeof ICON }) => (
  <span className="ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICON[d]}</svg></span>
);
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
  const monthKey = istDay(now).slice(0, 7);
  const monthStart = new Date(`${monthKey}-01T00:00:00+05:30`);
  const [bookings, monthBookings, leads, calls] = await Promise.all([
    s.repo.listBookings(new Date(now.getTime() - 2 * 3600e3).toISOString(), new Date(now.getTime() + 14 * 864e5).toISOString()),
    s.repo.listBookings(monthStart.toISOString(), new Date(monthStart.getTime() + 32 * 864e5).toISOString()),
    s.repo.listLeads({ limit: 500 }),
    s.repo.listCalls({ since: new Date(now.getTime() - 31 * 864e5).toISOString(), limit: 2000 }),
  ]);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const g = glance(calls, leads, now);
  const next = bookings.find((b) => Date.parse(b.start_at) > now.getTime() - 3600e3);
  const nextLead = next?.lead_id ? byId.get(next.lead_id) : undefined;
  const lastCall = [...calls].filter((c) => c.lead_id).sort((a, b) => Date.parse(b.started_at ?? b.created_at) - Date.parse(a.started_at ?? a.created_at))[0];

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
          <div className="pill-eyebrow"><i />Call desk · {now.toLocaleDateString("en-IN", { timeZone: TZ, month: "long", year: "numeric" })}</div>
          <h1>Hello, <em>designer.</em></h1>
          <p>{next
            ? <>Your next consultation is with <b>{nextLead?.name ?? "a client"}</b> {whenPhrase(next.start_at)}.</>
            : "No consultations booked yet. New bookings appear here the moment a caller books."}</p>
          <div className="funnel">
            <div className="funnel-step"><Ico d="phone" /><b><CountUp value={g.calls} /></b><small>Answered</small></div>
            <div className="funnel-step"><Ico d="check" /><b><CountUp value={g.qualified} /></b><small>Qualified</small></div>
            <div className="funnel-step"><Ico d="cal" /><b><CountUp value={g.booked} /></b><small>Booked</small></div>
          </div>
          <p className="funnel-note">Last 30 days</p>
          <div className="actions">
            <Link className="act primary" href="/calendar">Upcoming consultations <span className="arrow">→</span></Link>
            <Link className="act" href="/calls?show=followup">↻ Follow up</Link>
          </div>
        </div>

        <div className="home-visual rise" style={{ ["--i" as string]: 2 }}>
          <div className="home-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MEDIA.studioPoster} alt="" aria-hidden="true" />
            <video autoPlay muted loop playsInline poster={MEDIA.studioPoster} aria-hidden="true"><source src={MEDIA.studioVideo} type="video/mp4" /></video>
          </div>
          {lastCall && <LastCall call={lastCall} lead={byId.get(lastCall.lead_id!)} />}
          <MiniCal now={now} bookings={monthBookings} leads={leads} />
        </div>
      </section>

      <div className="home-lists">
        <section className="panel reveal">
          <div className="panel-head"><h2>Coming up</h2><Link href="/calendar">Calendar <span className="arrow">→</span></Link></div>
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

/** The most recent call, with a live voice wave. */
function LastCall({ call, lead }: { call: CallRow; lead?: LeadRow }) {
  const at = call.started_at ?? call.created_at;
  return (
    <Link href={lead ? `/calls/${lead.id}` : "/calls"} className="float-card last-call">
      <span className="lc-avatar" aria-hidden="true">{(lead?.name ?? "?").slice(0, 1).toUpperCase()}</span>
      <span className="lc-body">
        <small>Last call · {ago(at)}</small>
        <b>{lead?.name ?? "Unknown caller"}</b>
        <span className="lc-meta">
          <span className={`badge badge-${lead?.verdict ?? "pending"}`}>{lead?.verdict ?? "pending"}</span>
          {lead?.locality && <span className="muted">{lead.locality}</span>}
        </span>
      </span>
      <span className="wave-bars" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</span>
    </Link>
  );
}

/** This month: booked days filled, today outlined, days with new enquiries dotted. */
function MiniCal({ now, bookings, leads }: { now: Date; bookings: BookingRow[]; leads: LeadRow[] }) {
  const todayKey = istDay(now), [y, m] = todayKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const booked = new Set(bookings.map((b) => istDay(new Date(b.start_at))));
  const enquiries = new Set(leads.map((l) => istDay(new Date(l.first_seen_at))));
  const key = (d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthCalls = [...enquiries].filter((k) => k.startsWith(todayKey.slice(0, 7))).length;
  return (
    <Link href="/calendar" className="float-card mini-cal" aria-label="Open the calendar">
      <div className="mc-head"><b>{first.toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" })}</b><small><i className="dot" style={{ background: "var(--brand)" }} />{booked.size} booked · {monthCalls} enquiry days</small></div>
      <div className="mc-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={`h${i}`} className="mc-dow">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const k = key(i + 1);
          return <span key={k} className={["mc-day", booked.has(k) && "booked", k === todayKey && "today", enquiries.has(k) && "enq"].filter(Boolean).join(" ")}>{i + 1}</span>;
        })}
      </div>
    </Link>
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
