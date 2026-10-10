import type { ReactNode } from "react";
import type { LeadRow } from "@/lib/db/types";
import { CountUp } from "@/app/fx/count-up";

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

/** Page header: full-bleed photo or video, serif headline, quiet stats. */
export function Hero({ image, video, eyebrow, title, subtitle, stats, compact, children }: {
  image?: string; video?: string; eyebrow?: string; title: ReactNode; subtitle?: ReactNode;
  stats?: { label: string; value: ReactNode }[]; compact?: boolean; children?: ReactNode;
}) {
  return (
    <section className={`hero rise${compact ? " compact" : ""}${image || video ? "" : " plain"}`}>
      {video ? (
        <video className="hero-media" autoPlay muted loop playsInline poster={image} aria-hidden="true"><source src={video} type="video/mp4" /></video>
      ) : image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hero-media" src={image} alt="" aria-hidden="true" />
      ) : null}
      <div className="hero-inner">
        <div>
          {eyebrow && <div className="hero-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children}
        </div>
        {stats && stats.length > 0 && (
          <div className="hero-stats">
            {stats.map((st, i) => (
              <div className="hero-stat rise" style={{ ["--i" as string]: i + 2 }} key={st.label}>
                <b>{typeof st.value === "number" || typeof st.value === "string" ? <CountUp value={st.value} /> : st.value}</b><span>{st.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
