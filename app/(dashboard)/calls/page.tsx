import Link from "next/link";
import { services } from "@/lib/container";
import type { LeadFilter } from "@/lib/db/types";
import { fmtDate, StatusPill, VerdictBadge } from "@/app/ui";
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

  return (
    <>
      <div className="page-head">
        <h1>Enquiries</h1>
        <span className="muted">{leads.length} shown</span>
      </div>
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
        <button type="submit">Filter</button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Last call</th><th>Caller</th><th>Locality</th><th>Property</th><th>Verdict</th><th>Booking</th><th>Flags</th></tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/calls/${l.id}`}>{fmtDate(l.last_call_at)}</Link></td>
                <td><Link href={`/calls/${l.id}`}>{l.name ?? "Unknown"}</Link><div className="muted small">{displayPhone(l.phone)}</div></td>
                <td>{l.locality ?? "—"}</td>
                <td>{[l.facts.bhk ? `${l.facts.bhk}BHK` : null, l.facts.property_type?.replace(/_/g, " "), l.facts.carpet_area_sqft ? `${l.facts.carpet_area_sqft} sq ft` : null].filter(Boolean).join(" · ") || "—"}</td>
                <td><VerdictBadge verdict={l.verdict} urgent={l.urgent} /></td>
                <td><StatusPill value={l.booking_status} /></td>
                <td className="small">{[...l.flags, ...l.review_reasons.map((r) => `review: ${r}`)].map((f) => f.replace(/_/g, " ")).join(", ") || "—"}</td>
              </tr>
            ))}
            {leads.length === 0 && <tr><td colSpan={7} className="muted empty">No enquiries match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
