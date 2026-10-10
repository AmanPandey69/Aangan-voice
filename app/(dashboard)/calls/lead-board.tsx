"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface BoardLead {
  id: string; name: string; phone: string; locality: string; property: string; verdict: string | null;
  urgent: boolean; booking: string; flags: string[]; reviews: string[]; when: string;
}

const VERDICTS = [
  { key: "all", label: "All" },
  { key: "qualified", label: "Qualified", color: "#2e8b57" },
  { key: "escalate", label: "Escalate", color: "#e76f51" },
  { key: "declined", label: "Declined", color: "#6b8682" },
  { key: "pending", label: "Pending", color: "#9aa9a7" },
] as const;
const BOOKINGS = [
  { key: "any", label: "Any booking" },
  { key: "booked", label: "Booked" },
  { key: "needs_manual_booking", label: "Needs manual booking" },
] as const;

const human = (s: string) => s.replace(/_/g, " ");

export function LeadBoard({ leads }: { leads: BoardLead[] }) {
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<string>("all");
  const [booking, setBooking] = useState<string>("any");
  const [review, setReview] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const router = useRouter();

  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads.filter((l) => !s || [l.name, l.phone, l.locality, l.property].some((v) => v.toLowerCase().includes(s)))
      .filter((l) => booking === "any" || l.booking === booking)
      .filter((l) => !review || l.reviews.length > 0);
  }, [leads, q, booking, review]);
  const shown = verdict === "all" ? base : base.filter((l) => (l.verdict ?? "pending") === verdict);
  const count = (k: string) => (k === "all" ? base.length : base.filter((l) => (l.verdict ?? "pending") === k).length);

  return (
    <>
      <div className="toolbar rise" style={{ ["--i" as string]: 3 }}>
        <div className="toolbar-row">
          <label className="search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, locality, property…" aria-label="Search enquiries" /></label>
          <div className="seg" role="tablist" aria-label="View">
            <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ List</button>
            <button type="button" className={view === "board" ? "on" : ""} onClick={() => setView("board")}>▦ Board</button>
          </div>
        </div>
        <div className="toolbar-row">
          {VERDICTS.map((v) => (
            <button key={v.key} type="button" className={`chip${verdict === v.key ? " on" : ""}`} onClick={() => setVerdict(v.key)}>
              {v.label} <b>{count(v.key)}</b>
            </button>
          ))}
          <span style={{ width: 8 }} />
          {BOOKINGS.map((b) => (
            <button key={b.key} type="button" className={`chip${booking === b.key ? " on" : ""}`} onClick={() => setBooking(b.key)}>{b.label}</button>
          ))}
          <button type="button" className={`chip${review ? " on" : ""}`} onClick={() => setReview(!review)}>⚑ Needs review</button>
          <span className="result-count">{shown.length} shown</span>
        </div>
      </div>

      {view === "list" ? (
        <div className="table-wrap rise glow" style={{ ["--i" as string]: 4 }}>
          <table className="table">
            <thead><tr><th>Caller</th><th>When</th><th>Locality</th><th>Property</th><th>Verdict</th><th>Booking</th><th>Flags</th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className="row-link" onClick={() => router.push(`/calls/${l.id}`)}>
                  <td>
                    <div className="who">
                      <span className="avatar">{l.name.slice(0, 1).toUpperCase()}</span>
                      <div><Link href={`/calls/${l.id}`} className="caller-name" onClick={(e) => e.stopPropagation()}>{l.name}</Link><div className="muted small">{l.phone}</div></div>
                    </div>
                  </td>
                  <td className="nowrap small">{l.when}</td>
                  <td>{l.locality || "—"}</td>
                  <td>{l.property || "—"}</td>
                  <td><span className={`badge badge-${l.verdict ?? "pending"}`}>{l.verdict ?? "pending"}{l.urgent ? " · urgent" : ""}</span></td>
                  <td><span className={`pill pill-${l.booking}`}>{human(l.booking)}</span></td>
                  <td>
                    {l.flags.map((f) => <span key={f} className="flag">{human(f)}</span>)}
                    {l.reviews.map((r) => <span key={r} className="flag review">review: {human(r)}</span>)}
                    {l.flags.length + l.reviews.length === 0 && <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="muted empty">No enquiries match. Try clearing a filter.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="board">
          {VERDICTS.filter((v) => v.key !== "all").map((v, li) => {
            const cards = base.filter((l) => (l.verdict ?? "pending") === v.key);
            return (
              <section key={v.key} className="lane rise" style={{ ["--i" as string]: li + 4 }}>
                <div className="lane-head"><span><i style={{ background: "color" in v ? v.color : undefined }} />{v.label}</span><span>{cards.length}</span></div>
                <div className="lane-cards">
                  {cards.map((l) => (
                    <Link key={l.id} href={`/calls/${l.id}`} className="lead-card glow tilt">
                      <div className="who"><span className="avatar">{l.name.slice(0, 1).toUpperCase()}</span>
                        <div><b>{l.name}</b><div className="muted small">{l.locality || "Locality not stated"}</div></div></div>
                      <div className="meta">
                        {l.property && <span>{l.property}</span>}
                        <span className={`pill pill-${l.booking}`}>{human(l.booking)}</span>
                        {l.urgent && <span className="flag review">urgent</span>}
                      </div>
                    </Link>
                  ))}
                  {cards.length === 0 && <p className="muted small" style={{ padding: "4px 6px" }}>Nothing here.</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
