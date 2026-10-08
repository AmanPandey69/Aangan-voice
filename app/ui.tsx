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
