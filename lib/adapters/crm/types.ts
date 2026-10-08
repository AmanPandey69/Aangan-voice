import type { LeadRow } from "@/lib/db/types";

export interface CRMSyncResult { contactId: string; dealId: string | null }

export interface CRMProvider {
  readonly name: string;
  /** Qualified → contact + open deal. Declined → contact + closed-lost deal with reason. Escalate → contact + note. */
  syncLead(lead: LeadRow, dashboardUrl: string): Promise<CRMSyncResult>;
  dealUrl(dealId: string): string | null;
}
