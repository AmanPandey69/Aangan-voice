import type { ReactNode } from "react";
import type { LeadRow } from "@/lib/db/types";

export function VerdictBadge({ verdict, urgent }: { verdict: LeadRow["verdict"]; urgent?: boolean }) {
  const v = verdict ?? "pending";
  return <span className={`badge badge-${v}`}>{v}{urgent ? " · urgent" : ""}</span>;
}

export function StatusPill({ value }: { value: string }) {
  return <span className={`pill pill-${value}`}>{value.replace(/_/g, " ")}</span>;
}

export const fmtDate = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
  : "—";

export const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;

/** Page header: interior photo under a teal → aqua ombre, title, subtitle and optional quick stats. */
export function Hero({ image, eyebrow, title, subtitle, stats, compact, children }: {
  image?: string; eyebrow?: string; title: ReactNode; subtitle?: ReactNode;
  stats?: { label: string; value: ReactNode }[]; compact?: boolean; children?: ReactNode;
}) {
  return (
    <section className={`hero${compact ? " compact" : ""}${image ? "" : " plain"}`} style={image ? { backgroundImage: `url("${image}")` } : undefined}>
      <div className="hero-inner">
        <div>
          {eyebrow && <div className="hero-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children}
        </div>
        {stats && stats.length > 0 && (
          <div className="hero-stats">
            {stats.map((st) => <div className="hero-stat" key={st.label}><b>{st.value}</b><span>{st.label}</span></div>)}
          </div>
        )}
      </div>
    </section>
  );
}
