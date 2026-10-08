import type { LeadRow } from "@/lib/db/types";
import { findPriceLeaks } from "@/lib/guard/price-guard";
import { hasRealPhone } from "@/lib/phone";
import type { CRMProvider, CRMSyncResult } from "./types";

/**
 * HubSpot CRM via a service key or private-app token, both sent as a Bearer token (scopes: crm.objects.contacts.read/write,
 * crm.objects.deals.read/write). Uses the v3 object endpoints, which HubSpot
 * still serves alongside the newer date-versioned paths. Sources, checked 2026-10-08:
 *  - https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/guide
 *  - https://developers.hubspot.com/docs/api-reference/latest/crm/objects/deals/guide
 *  - https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/guide
 *
 * Stage IDs and properties confirmed in the Aangan Studio portal on 2026-10-08
 * (pipeline "default": appointmentscheduled … closedlost; closed_lost_reason exists).
 * If the pipeline is customised later, set HUBSPOT_PIPELINE / HUBSPOT_STAGE_OPEN /
 * HUBSPOT_STAGE_LOST (check with GET /crm/v3/pipelines/deals).
 */
const API = "https://api.hubapi.com";
const DEAL_TO_CONTACT = 3;

export class HubSpotCRM implements CRMProvider {
  readonly name = "hubspot";
  private pipeline = process.env.HUBSPOT_PIPELINE || "default";
  private stageOpen = process.env.HUBSPOT_STAGE_OPEN || "appointmentscheduled";
  private stageLost = process.env.HUBSPOT_STAGE_LOST || "closedlost";
  private lostReasonProp = process.env.HUBSPOT_LOST_REASON_PROPERTY || "closed_lost_reason";

  constructor(private token: string, private portalId: string | undefined) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method, signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`hubspot ${method} ${path.split("?")[0]} ${res.status}`);
    return (res.status === 204 ? {} : await res.json()) as T;
  }

  private async findContact(lead: LeadRow): Promise<string | null> {
    if (lead.hubspot_contact_id) return lead.hubspot_contact_id;
    if (!lead.email && !hasRealPhone(lead.phone)) return null; // online call with no contact details: always a new contact
    const filters = lead.email
      ? [{ propertyName: "email", operator: "EQ", value: lead.email }]
      // Phone search matches on the national number without the country code.
      : [{ propertyName: "hs_searchable_calculated_phone_number", operator: "EQ", value: lead.phone.replace(/^\+91/, "").replace(/\D/g, "") }];
    const r = await this.call<{ results?: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", { filterGroups: [{ filters }], limit: 1 });
    return r.results?.[0]?.id ?? null;
  }

  async syncLead(lead: LeadRow, dashboardUrl: string): Promise<CRMSyncResult> {
    const [firstname, ...rest] = (lead.name ?? "").trim().split(/\s+/);
    const contactProps: Record<string, string> = {
      hs_lead_status: lead.verdict === "qualified" ? "OPEN_DEAL" : lead.verdict === "declined" ? "UNQUALIFIED" : "IN_PROGRESS",
    };
    if (hasRealPhone(lead.phone)) contactProps.phone = lead.phone;
    if (firstname) contactProps.firstname = firstname;
    if (rest.length) contactProps.lastname = rest.join(" ");
    if (lead.email) contactProps.email = lead.email;
    if (lead.locality) contactProps.city = lead.locality;

    let contactId = await this.findContact(lead);
    if (contactId) await this.call("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties: contactProps });
    else contactId = (await this.call<{ id: string }>("POST", "/crm/v3/objects/contacts", { properties: contactProps })).id;

    // Escalations (complaints, budget review) are not new deals; the contact is enough.
    if (lead.verdict !== "qualified" && lead.verdict !== "declined") return { contactId, dealId: lead.hubspot_deal_id };

    const f = lead.facts;
    const summary = f.summary && !findPriceLeaks(f.summary).length ? f.summary : "";
    const dealProps: Record<string, string> = {
      dealname: `${lead.name ?? lead.phone} · ${lead.locality ?? "locality n/a"} · ${[f.bhk ? `${f.bhk}BHK` : "", f.property_type ?? ""].join(" ").trim() || "enquiry"}`,
      pipeline: this.pipeline,
      dealstage: lead.verdict === "qualified" ? this.stageOpen : this.stageLost,
      description: [summary, `Dashboard: ${dashboardUrl}`].filter(Boolean).join("\n"),
    };
    if (lead.verdict === "declined") dealProps[this.lostReasonProp] = (lead.reason ?? "declined").slice(0, 250);

    if (lead.hubspot_deal_id) {
      await this.call("PATCH", `/crm/v3/objects/deals/${lead.hubspot_deal_id}`, { properties: dealProps });
      return { contactId, dealId: lead.hubspot_deal_id };
    }
    const deal = await this.call<{ id: string }>("POST", "/crm/v3/objects/deals", {
      properties: dealProps,
      associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }] }],
    });
    return { contactId, dealId: deal.id };
  }

  dealUrl(dealId: string): string | null {
    return this.portalId ? `https://app.hubspot.com/contacts/${this.portalId}/record/0-3/${dealId}` : null;
  }
}
