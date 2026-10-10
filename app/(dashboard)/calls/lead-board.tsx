"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ScoreRing } from "@/app/ui";

export interface BoardLead {
  id: string; name: string; phone: string; locality: string; property: string; verdict: string | null;
  urgent: boolean; booking: string; flags: string[]; reviews: string[]; when: string;
  score: number | null; followUp: boolean; photo: string;
}

const VERDICTS = [
  { key: "all", label: "All" },
  { key: "qualified", label: "Qualified", color: "#2e8b57" },
  { key: "escalate", label: "Escalate", color: "#e76f51" },
  { key: "declined", label: "Declined", color: "#6b8682" },
  { key: "pending", label: "Pending", color: "#9aa9a7" },
] as const;

const human = (s: string) => s.replace(/_/g, " ");

export function LeadBoard({ leads, initialFollowUp = false }: { leads: BoardLead[]; initialFollowUp?: boolean }) {
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState<string>("all");
  const [onlyReview, setOnlyReview] = useState(false);
  const [onlyFollowUp, setOnlyFollowUp] = useState(initialFollowUp);
  const [view, setView] = useState<"list" | "board">("list");

  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    return leads.filter((l) => !s || [l.name, l.phone, l.locality, l.property].some((v) => v.toLowerCase().includes(s)))
      .filter((l) => !onlyReview || l.reviews.length > 0)
      .filter((l) => !onlyFollowUp || l.followUp);
  }, [leads, q, onlyReview, onlyFollowUp]);
  const shown = verdict === "all" ? base : base.filter((l) => (l.verdict ?? "pending") === verdict);
  const count = (k: string) => (k === "all" ? base.length : base.filter((l) => (l.verdict ?? "pending") === k).length);

  return (
    <>
      <div className="bar rise" style={{ ["--i" as string]: 2 }}>
        <label className="search"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, area…" aria-label="Search enquiries" /></label>
        <div className="seg" role="tablist" aria-label="View">
          <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}>☰ List</button>
          <button type="button" className={view === "board" ? "on" : ""} onClick={() => setView("board")}>▦ Board</button>
        </div>
      </div>
      {view === "list" && (
        <div className="bar" style={{ marginTop: 0 }}>
          {VERDICTS.map((v) => (
            <button key={v.key} type="button" className={`chip${verdict === v.key ? " on" : ""}`} onClick={() => setVerdict(v.key)}>
              {v.label} <b>{count(v.key)}</b>
            </button>
          ))}
          <button type="button" className={`chip${onlyReview ? " on" : ""}`} onClick={() => setOnlyReview(!onlyReview)}>⚑ Needs review</button>
          <button type="button" className={`chip${onlyFollowUp ? " on" : ""}`} onClick={() => setOnlyFollowUp(!onlyFollowUp)} title="Good leads without a consultation yet">↻ Follow up <b>{leads.filter((l) => l.followUp).length}</b></button>
        </div>
      )}

      {view === "list" ? (
        <div className="list">
          {shown.map((l, i) => (
            <Link key={l.id} href={`/calls/${l.id}`} className="list-row rise" style={{ ["--i" as string]: Math.min(i, 10) + 3 }}>
              <div className="who">
                <span className="avatar">{l.name.slice(0, 1).toUpperCase()}</span>
                <div><b>{l.name}</b><div className="sub">{l.when}</div></div>
              </div>
              <div className="hide-sm"><div>{l.locality || "Area not stated"}</div><div className="sub">{l.property || "—"}</div></div>
              <div className="hide-sm"><span className={`pill pill-${l.booking}`}>{human(l.booking)}</span></div>
              <div className="end">
                <ScoreRing score={l.score} />
                {l.reviews.length > 0 && <span className="flag-ico" title={l.reviews.map(human).join(", ")}>⚑ {l.reviews.length}</span>}
                <span className={`badge badge-${l.verdict ?? "pending"}`}>{l.verdict ?? "pending"}{l.urgent ? " · urgent" : ""}</span>
              </div>
            </Link>
          ))}
          {shown.length === 0 && <div className="empty-state">No enquiries match. Try clearing the search.</div>}
        </div>
      ) : (
        <div className="board">
          {VERDICTS.filter((v) => v.key !== "all").map((v, li) => {
            const cards = base.filter((l) => (l.verdict ?? "pending") === v.key);
            return (
              <section key={v.key} className="lane rise" style={{ ["--i" as string]: li + 3 }}>
                <div className="lane-head"><span><i style={{ background: "color" in v ? v.color : undefined }} />{v.label}</span><span>{cards.length}</span></div>
                <div className="lane-cards">
                  {cards.map((l) => (
                    <Link key={l.id} href={`/calls/${l.id}`} className="lead-card glow tilt">
                      <div className="cover" style={{ backgroundImage: `url("${l.photo}")` }} aria-hidden="true"><ScoreRing score={l.score} size={34} /></div>
                      <div className="who"><span className="avatar">{l.name.slice(0, 1).toUpperCase()}</span>
                        <div><b>{l.name}</b><div className="muted small">{l.locality || "Area not stated"}</div></div></div>
                      <div className="meta">
                        {l.property && <span>{l.property}</span>}
                        <span className={`pill pill-${l.booking}`}>{human(l.booking)}</span>
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
