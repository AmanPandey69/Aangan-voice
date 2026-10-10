import Link from "next/link";
import { services } from "@/lib/container";
import { fmtDate, Hero } from "@/app/ui";
import { MEDIA, roomPhoto } from "@/config/media";
import { fitScore, needsFollowUp } from "@/lib/insights";
import { displayPhone } from "@/lib/phone";
import { LeadBoard, type BoardLead } from "./lead-board";

export const dynamic = "force-dynamic";

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "24h", label: "24 hours", days: 1 }, { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 }, { key: "all", label: "All time", days: null },
];

export default async function CallsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[2];
  const leads = await services().repo.listLeads({ since: range.days ? new Date(Date.now() - range.days * 864e5).toISOString() : undefined });
  const count = (fn: (l: (typeof leads)[number]) => boolean) => leads.filter(fn).length;

  const board: BoardLead[] = leads.map((l) => ({
    id: l.id, name: l.name ?? "Unknown caller", phone: displayPhone(l.phone), locality: l.locality ?? "",
    property: [l.facts.bhk ? `${l.facts.bhk}BHK` : null, l.facts.property_type?.replace(/_/g, " "), l.facts.carpet_area_sqft ? `${l.facts.carpet_area_sqft} sq ft` : null].filter(Boolean).join(" · "),
    verdict: l.verdict, urgent: l.urgent, booking: l.booking_status, flags: l.flags,
    reviews: l.review_resolved_at ? [] : l.review_reasons, when: fmtDate(l.last_call_at),
    score: fitScore(l.criteria), followUp: needsFollowUp(l), photo: roomPhoto(l.id, 600),
  }));

  return (
    <>
      <Hero
        image={MEDIA.heroEnquiries}
        eyebrow="Aangan Studio · Pune"
        title="Enquiries"
        subtitle="Everyone who called. Tap a name to see what they want and what to do next."
        stats={[
          { label: "enquiries", value: leads.length },
          { label: "booked", value: count((l) => l.booking_status === "booked") },
          { label: "to follow up", value: count(needsFollowUp) },
        ]}
      >
        <div className="toolbar-row" style={{ marginTop: 14 }}>
          {RANGES.map((r) => (
            <Link key={r.key} href={`/calls?range=${r.key}`} className={`chip${r.key === range.key ? " on" : ""}`} style={{ textDecoration: "none" }}>{r.label}</Link>
          ))}
        </div>
      </Hero>
      <LeadBoard leads={board} initialFollowUp={sp.show === "followup"} />
    </>
  );
}
