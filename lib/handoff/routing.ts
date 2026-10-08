import { env } from "@/lib/env";
import type { LeadRow } from "@/lib/db/types";

export interface Route { to: string; cc: string | null }

/**
 * Who receives the handoff for a lead. One designer for now; add
 * assignment rules here (by locality, segment, size, load) later.
 */
export function routeLead(_lead: LeadRow): Route | null {
  const to = env.designerEmail();
  if (!to) return null;
  const cc = env.frontDeskEmail() ?? null;
  return { to, cc: cc && cc !== to ? cc : null };
}
