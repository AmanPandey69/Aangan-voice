import Link from "next/link";
import { services } from "@/lib/container";
import { MEDIA, roomPhoto } from "@/config/media";
import { CountUp } from "@/app/fx/count-up";
import { propertyLabel } from "@/lib/handoff/email";
import { telHref, whatsappHref } from "@/lib/handoff/brief";
import type { LeadRow, ReviewReason } from "@/lib/db/types";
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

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { timeZone: TZ, hour: "numeric", hour12: false }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage() {
  const s = services();
  const now = new Date();
  const [bookings, leads, calls] = await Promise.all([
    s.repo.listBookings(new Date(now.getTime() - 2 * 3600e3).toISOString(), new Date(now.getTime() + 7 * 864e5).toISOString()),
    s.repo.listLeads({ limit: 500 }),
    s.repo.listCalls({ since: new Date(now.getTime() - 31 * 864e5).toISOString(), limit: 2000 }),
  ]);
  const g = glance(calls, leads, now);
  const byId = new Map(leads.map((l) => [l.id, l]));
  const todayCount = bookings.filter((b) => istDay(new Date(b.start_at)) === istDay(now)).length;
  const weekNew = leads.filter((l) => Date.parse(l.first_seen_at) > now.getTime() - 7 * 864e5).length;
  const needs = leads
    .filter((l) => !l.review_resolved_at && l.review_reasons.some((r) => NEED_TEXT[r]))
    .map((l) => ({ l, r: PRIORITY.find((p) => l.review_reasons.includes(p))! }))
    .sort((a, b) => PRIORITY.indexOf(a.r) - PRIORITY.indexOf(b.r));
  const fresh = leads.filter((l) => l.verdict).slice(0, 8);
  const inNeeds = new Set(needs.map((n) => n.l.id));
  const followUp = leads.filter((l) => needsFollowUp(l) && !inNeeds.has(l.id));

  return (
    <>
      <section className="vhero rise">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MEDIA.studioPoster} alt="" aria-hidden="true" />
        <video autoPlay muted loop playsInline poster={MEDIA.studioPoster} aria-hidden="true"><source src={MEDIA.studioVideo} type="video/mp4" /></video>
        <div className="vhero-inner">
          <div>
            <div className="hero-eyebrow">{now.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })}</div>
            <h1>{greeting()}.</h1>
            <p>Your consultations, the people waiting on you, and who called. Nothing else.</p>
          </div>
          <div className="kpis">
            <div className="kpi"><b><CountUp value={todayCount} /></b><span>consultations today</span></div>
            <div className="kpi"><b><CountUp value={weekNew} /></b><span>new this week</span></div>
            <div className="kpi"><b><CountUp value={needs.length} /></b><span>need you</span></div>
          </div>
        </div>
      </section>

      <div className="section-title reveal"><h2>Coming up</h2><Link href="/calendar">Calendar <span className="arrow">→</span></Link></div>
      {bookings.length === 0 ? (
        <div className="empty-state reveal">No consultations booked yet. New bookings appear here automatically.</div>
      ) : (
        <div className="agenda">
          {bookings.slice(0, 6).map((b, i) => {
            const l = b.lead_id ? byId.get(b.lead_id) : undefined;
            return <AgendaItem key={b.id} i={i} start={b.start_at} lead={l} />;
          })}
        </div>
      )}

      <div className="section-title reveal"><h2>Needs you</h2><Link href="/review">Review queue <span className="arrow">→</span></Link></div>
      {needs.length === 0 ? (
        <div className="empty-state reveal">All clear. Nothing needs a person right now.</div>
      ) : (
        <div className="needs">
          {needs.slice(0, 4).map(({ l, r }, i) => (
            <Link key={l.id} href={`/calls/${l.id}`} className="need reveal" style={{ transitionDelay: `${i * 70}ms` }}>
              <span className="dot" style={{ background: NEED_TEXT[r]![1] }} />
              <span><b>{l.name ?? "Unknown caller"}</b><small>{NEED_TEXT[r]![0]}{l.locality ? ` · ${l.locality}` : ""}</small></span>
              <span className="go">Open <span className="arrow">→</span></span>
            </Link>
          ))}
        </div>
      )}

      <div className="section-title reveal"><h2>Follow up</h2><Link href="/calls?show=followup">All <span className="arrow">→</span></Link></div>
      {followUp.length === 0 ? (
        <div className="empty-state reveal">Every good lead has a consultation booked.</div>
      ) : (
        <div className="agenda">
          {followUp.slice(0, 4).map((l, i) => <FollowUpItem key={l.id} i={i} lead={l} />)}
        </div>
      )}

      <div className="section-title reveal"><h2>Last 30 days</h2><Link href="/costs">Costs <span className="arrow">→</span></Link></div>
      <AtAGlance g={g} />

      <div className="section-title reveal"><h2>Latest enquiries</h2><span className="rail-hint">Drag to browse ⟷</span></div>
      <div className="rail reveal">
        {fresh.map((l) => (
          <Link key={l.id} href={`/calls/${l.id}`} className="photo-card" draggable={false}>
            <div className="ph" style={{ backgroundImage: `url("${roomPhoto(l.id)}")` }}>
              <span className={`badge badge-${l.verdict ?? "pending"}`} style={{ background: "#fff" }}>{l.verdict ?? "pending"}</span>
            </div>
            <div className="body"><b>{l.name ?? "Unknown caller"}</b><small>{[l.locality, propertyLabel(l.facts)].filter(Boolean).join(" · ")}</small></div>
          </Link>
        ))}
      </div>
    </>
  );
}

function AgendaItem({ start, lead, i }: { start: string; lead?: LeadRow; i: number }) {
  const tel = lead ? telHref(lead) : null, wa = lead ? whatsappHref(lead) : null;
  return (
    <div className="agenda-item reveal" style={{ transitionDelay: `${i * 70}ms` }}>
      <div className="agenda-time"><b>{time(start)}</b><span>{dayLabel(start)}</span></div>
      <div className="agenda-who">
        <span className="thumb" style={{ backgroundImage: `url("${roomPhoto(lead?.id ?? start, 240)}")` }} aria-hidden="true" />
        <div>
          <h3>{lead?.name ?? "Consultation"}</h3>
          <p>{lead ? [lead.locality, propertyLabel(lead.facts), lead.facts.carpet_area_sqft ? `${lead.facts.carpet_area_sqft} sq ft` : null].filter(Boolean).join(" · ") : "Booked directly in Cal.com"}</p>
        </div>
      </div>
      <div className="actions">
        {tel && <a className="act" href={tel}>📞 Call</a>}
        {wa && <a className="act wa" href={wa} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
        {lead && <Link className="act primary" href={`/calls/${lead.id}`}>Prep <span className="arrow">→</span></Link>}
      </div>
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
        <p>{g.priceLeaks ? <Link href="/review">Check {g.priceLeaks} call{g.priceLeaks > 1 ? "s" : ""} in the review queue →</Link> : g.priceAsked ? "Every one was steered to the consultation. No number was ever said." : "Nobody asked yet. If they do, the assistant offers the consultation, never a number."}</p>
      </div>
    </div>
  );
}

function FollowUpItem({ lead, i }: { lead: LeadRow; i: number }) {
  const tel = telHref(lead), wa = whatsappHref(lead);
  const why = lead.booking_status === "needs_manual_booking" ? "Wanted a slot, not booked yet"
    : lead.booking_status === "cancelled" ? "Cancelled their consultation" : lead.verdict === "escalate" ? "Asked for a person" : "Qualified, no consultation yet";
  return (
    <div className="agenda-item reveal" style={{ transitionDelay: `${i * 70}ms` }}>
      <div className="agenda-time"><ScoreRing score={fitScore(lead.criteria)} size={44} /><span>fit</span></div>
      <div className="agenda-who">
        <span className="thumb" style={{ backgroundImage: `url("${roomPhoto(lead.id, 240)}")` }} aria-hidden="true" />
        <div>
          <h3>{lead.name ?? "Unknown caller"}</h3>
          <p>{[why, lead.locality, propertyLabel(lead.facts)].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="actions">
        {tel && <a className="act" href={tel}>📞 Call</a>}
        {wa && <a className="act wa" href={wa} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
        <Link className="act primary" href={`/calls/${lead.id}`}>Open <span className="arrow">→</span></Link>
      </div>
    </div>
  );
}
