import Link from "next/link";
import { services } from "@/lib/container";
import type { LeadFilter } from "@/lib/db/types";
import { fmtDate, Hero, StatusPill, VerdictBadge } from "@/app/ui";
import { MEDIA } from "@/config/media";
import { displayPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number | null> = { "24h": 1, "7d": 7, "30d": 30, all: null };

export default async function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const range = sp.range && sp.range in RANGES ? sp.range : "30d";
  const days = RANGES[range];
  const filter: LeadFilter = {
    verdict: (["qualified", "declined", "escalate"] as const).find((v) => v === sp.verdict),
    booking_status: (["booked", "needs_manual_booking", "not_offered", "none", "cancelled"] as const).find((v) => v === sp.booking),
    search: sp.q?.slice(0, 60) || undefined,
    since: days ? new Date(Date.now() - days * 864e5).toISOString() : undefined,
    needsReview: sp.review === "1" ? true : undefined,
  };
  const leads = await services().repo.listLeads(filter);
  const count = (fn: (l: (typeof leads)[number]) => boolean) => leads.filter(fn).length;

  return (
    <>
      <Hero
        image={MEDIA.heroEnquiries}
        eyebrow="Aangan Studio · Pune"
        title="Enquiries"
        subtitle="Every call the assistant answered, with its verdict, booking and follow-up."
        stats={[
          { label: "shown", value: leads.length },
          { label: "qualified", value: count((l) => l.verdict === "qualified") },
          { label: "booked", value: count((l) => l.booking_status === "booked") },
          { label: "to review", value: count((l) => l.review_reasons.length > 0 && !l.review_resolved_at) },
        ]}
      />
      <form className="filters" method="get">
        <input name="q" placeholder="Search name, phone, locality" defaultValue={sp.q ?? ""} />
        <select name="verdict" defaultValue={sp.verdict ?? ""}>
          <option value="">All verdicts</option><option value="qualified">Qualified</option>
          <option value="declined">Declined</option><option value="escalate">Escalate</option>
        </select>
        <select name="booking" defaultValue={sp.booking ?? ""}>
          <option value="">Any booking</option><option value="booked">Booked</option>
          <option value="needs_manual_booking">Needs manual booking</option><option value="not_offered">Not offered</option>
        </select>
        <select name="range" defaultValue={range}>
          <option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option><option value="all">All time</option>
        </select>
        <label className="check"><input type="checkbox" name="review" value="1" defaultChecked={sp.review === "1"} /> Needs review</label>
        <button type="submit">Apply filters</button>
        <a className="btn btn-secondary" href="/calls">Reset</a>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Last call</th><th>Caller</th><th>Locality</th><th>Property</th><th>Verdict</th><th>Booking</th><th>Flags</th></tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td className="nowrap"><Link href={`/calls/${l.id}`}>{fmtDate(l.last_call_at)}</Link></td>
                <td><Link href={`/calls/${l.id}`} className="caller-name">{l.name ?? "Unknown caller"}</Link><div className="muted small">{displayPhone(l.phone)}</div></td>
                <td>{l.locality ?? "—"}</td>
                <td>{[l.facts.bhk ? `${l.facts.bhk}BHK` : null, l.facts.property_type?.replace(/_/g, " "), l.facts.carpet_area_sqft ? `${l.facts.carpet_area_sqft} sq ft` : null].filter(Boolean).join(" · ") || "—"}</td>
                <td><VerdictBadge verdict={l.verdict} urgent={l.urgent} /></td>
                <td><StatusPill value={l.booking_status} /></td>
                <td>
                  {l.flags.map((f) => <span key={f} className="flag">{f.replace(/_/g, " ")}</span>)}
                  {!l.review_resolved_at && l.review_reasons.map((r) => <span key={r} className="flag review">review: {r.replace(/_/g, " ")}</span>)}
                  {l.flags.length === 0 && (l.review_resolved_at || l.review_reasons.length === 0) && <span className="muted">—</span>}
                </td>
              </tr>
            ))}
            {leads.length === 0 && <tr><td colSpan={7} className="muted empty">No enquiries match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
