"use client";
import { useState } from "react";
import Link from "next/link";

export interface CalEvent { id: string; start: string; name: string; sub: string; leadId: string | null }

const TZ = "Asia/Kolkata";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

export function MonthGrid({ year, month, events, newByDay, todayKey }: { year: number; month: number; events: CalEvent[]; newByDay: Record<string, number>; todayKey: string }) {
  const first = new Date(Date.UTC(year, month, 1));
  const startDow = (first.getUTCDay() + 6) % 7; // Monday first
  const days: { key: string; d: number; other: boolean }[] = [];
  for (let i = -startDow; days.length < 42; i++) {
    const dt = new Date(Date.UTC(year, month, 1 + i));
    days.push({ key: dt.toISOString().slice(0, 10), d: dt.getUTCDate(), other: dt.getUTCMonth() !== month });
  }
  const lastRowUsed = days.slice(35).some((x) => !x.other);
  const grid = lastRowUsed ? days : days.slice(0, 35);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) byDay.set(dayKey(e.start), [...(byDay.get(dayKey(e.start)) ?? []), e]);
  const initial = byDay.has(todayKey) ? todayKey : [...byDay.keys()].sort()[0] ?? todayKey;
  const [sel, setSel] = useState(initial);
  const selEvents = byDay.get(sel) ?? [];

  return (
    <>
      <div className="cal rise" style={{ ["--i" as string]: 2 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {grid.map(({ key, d, other }) => {
          const evs = byDay.get(key) ?? [];
          return (
            <button key={key} type="button" onClick={() => setSel(key)}
              className={`cal-day${other ? " other" : ""}${key === todayKey ? " today" : ""}${key === sel ? " sel" : ""}${evs.length ? " has" : ""}`}
              aria-label={`${key}: ${evs.length} consultations`}>
              <span className="num">{d}</span>
              {evs.slice(0, 2).map((e) => <span key={e.id} className="cal-ev">{time(e.start)} {e.name}</span>)}
              {evs.length > 2 && <span className="cal-ev more">+{evs.length - 2} more</span>}
              {newByDay[key] ? <span className="cal-dots">● {newByDay[key]} new {newByDay[key] === 1 ? "enquiry" : "enquiries"}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="section-title"><h2>{new Date(`${sel}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</h2></div>
      {selEvents.length === 0 ? <div className="empty-state">No consultations on this day.</div> : (
        <div className="agenda">
          {selEvents.map((e) => (
            <div key={e.id} className="agenda-item">
              <div className="agenda-time"><b>{time(e.start)}</b><span>1 hour</span></div>
              <div><h3>{e.name}</h3><p>{e.sub}</p></div>
              <div className="actions">{e.leadId && <Link className="act primary" href={`/calls/${e.leadId}`}>Open →</Link>}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
