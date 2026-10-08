import { services } from "@/lib/container";
import { verifyAckToken } from "@/lib/handoff/ack-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f3ee;color:#2b2722;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<div style="background:#fff;border-radius:10px;padding:28px;max-width:420px"><h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="margin:0;line-height:1.5">${body}</p></div></body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

/** The designer clicks "Acknowledge" in the handoff email. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const v = verifyAckToken(token);
  if (!v) return page("Link not valid", "This acknowledgement link is invalid or has expired.", 400);

  const s = services();
  const n = await s.repo.getNotification(v.notificationId);
  if (!n) return page("Not found", "We couldn't find that handoff.", 404);
  if (!n.acknowledged_at) {
    const at = new Date().toISOString();
    await s.repo.updateNotification(n.id, { acknowledged_at: at });
    if (n.lead_id) {
      const lead = await s.repo.getLead(n.lead_id);
      const stillOpen = (await s.repo.listNotifications({ leadId: n.lead_id }))
        .some((x) => x.id !== n.id && x.kind !== "reminder" && x.sent_at && !x.acknowledged_at && x.flagged_unacknowledged_at);
      if (lead && !stillOpen && lead.review_reasons.includes("unacknowledged_handoff")) {
        await s.repo.updateLead(lead.id, { review_reasons: lead.review_reasons.filter((r) => r !== "unacknowledged_handoff") });
      }
    }
  }
  return page("Thank you, acknowledged", "The studio can see you've picked this up. You can close this tab.");
}
