import { DISCLOSURE_LINE } from "@/lib/rules/copy";

/**
 * Starts an in-browser (WebRTC) call with the Vaani agent.
 * Docs: https://docs.vaanivoice.ai/api-reference/trigger-call (medium "webrtc"), checked 2026-10-10.
 * Returns a LiveKit token + server URL; the browser joins with livekit-client.
 */
export interface WebCallSession { token: string; connectionUrl: string; roomName: string }

export async function startVaaniWebCall(apiKey: string, agentId: string): Promise<WebCallSession> {
  const res = await fetch("https://api.vaanivoice.ai/api/trigger-call/", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      medium: "webrtc",
      primary_language: "en",
      secondary_language: "hi",
      // Always open with the AI + recording disclosure, whatever the dashboard greeting says.
      welcome_message: DISCLOSURE_LINE,
      welcome_interruptible: false,
      voice_gender: "female",
    }),
  });
  if (!res.ok) throw new Error(`vaani trigger-call ${res.status}`);
  const d = (await res.json()) as { token?: string; connection_url?: string; room_name?: string };
  if (!d.token || !d.connection_url) throw new Error("vaani trigger-call: no token in response");
  return { token: d.token, connectionUrl: d.connection_url, roomName: d.room_name ?? "" };
}
