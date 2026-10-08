import type { Services } from "@/lib/container";
import type { JobRow } from "@/lib/db/types";
import { processCall } from "./process-call";
import { dashboardLeadUrl, notifyForLead, processAckReminders } from "./notify";

/** Job kinds. Every side effect that can fail goes through here so it can be retried. */
export async function runJob(s: Services, job: JobRow): Promise<void> {
  switch (job.kind) {
    case "process_call": {
      const ev = await s.repo.getWebhookEvent(String(job.payload.webhookEventId));
      if (!ev) throw new Error("webhook event not found");
      const call = s.voice.parseWebhook(ev.payload);
      if (call) await processCall(s, call, ev.id);
      await s.repo.markWebhookProcessed(ev.id);
      return;
    }
    case "crm_sync": {
      const lead = await s.repo.getLead(String(job.payload.leadId));
      if (!lead || !lead.verdict) return;
      const r = await s.crm.syncLead(lead, dashboardLeadUrl(lead.id));
      await s.repo.updateLead(lead.id, { hubspot_contact_id: r.contactId, hubspot_deal_id: r.dealId ?? lead.hubspot_deal_id });
      return;
    }
    case "ack_reminders": {
      await processAckReminders(s, new Date());
      return;
    }
    case "notify": {
      await notifyForLead(s, String(job.payload.leadId));
      return;
    }
    default:
      throw new Error(`unknown job kind ${job.kind}`);
  }
}

/** Run due jobs; failures back off and eventually go to the dead-letter table. */
export async function drainJobs(s: Services, limit = 20) {
  const result = { ran: 0, failed: 0, dead: 0 };
  for (let round = 0; round < 3; round++) {
    const jobs = await s.repo.claimDueJobs(limit);
    if (!jobs.length) break;
    for (const job of jobs) {
      try {
        await runJob(s, job);
        await s.repo.completeJob(job.id);
        result.ran++;
      } catch (err) {
        const outcome = await s.repo.failJob(job, err instanceof Error ? err.message : String(err));
        if (outcome === "dead") result.dead++; else result.failed++;
      }
    }
  }
  return result;
}

/** Everything the retry cron does: queue the reminder sweep, then drain all due jobs. */
export async function runMaintenance(s: Services) {
  const pending = await s.repo.listJobs("pending");
  if (!pending.some((j) => j.kind === "ack_reminders")) await s.repo.enqueueJob("ack_reminders", {}, { maxAttempts: 1 });
  return drainJobs(s, 50);
}
