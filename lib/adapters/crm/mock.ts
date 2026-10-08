import type { LeadRow } from "@/lib/db/types";
import type { CRMProvider } from "./types";

export class MockCRM implements CRMProvider {
  readonly name = "mock";
  static synced: { leadId: string; verdict: string | null; stage: string }[] = [];
  static failNext = false;
  async syncLead(lead: LeadRow) {
    if (MockCRM.failNext) { MockCRM.failNext = false; throw new Error("mock CRM failure"); }
    const stage = lead.verdict === "declined" ? "closedlost" : "appointmentscheduled";
    MockCRM.synced.push({ leadId: lead.id, verdict: lead.verdict, stage });
    return { contactId: lead.hubspot_contact_id ?? `mock-contact-${lead.id.slice(0, 8)}`, dealId: lead.hubspot_deal_id ?? `mock-deal-${lead.id.slice(0, 8)}` };
  }
  dealUrl() { return null; }
}
