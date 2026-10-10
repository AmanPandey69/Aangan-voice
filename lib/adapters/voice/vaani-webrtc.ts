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
    // No overrides: the web call uses the agent exactly as configured in Vaani
    // (its greeting already discloses AI + recording). Overriding voice, language
    // or the greeting left web calls stuck after the greeting.
    body: JSON.stringify({ agent_id: agentId, medium: "webrtc" }),
  });
  if (!res.ok) throw new Error(`vaani trigger-call ${res.status}`);
  const d = (await res.json()) as { token?: string; connection_url?: string; room_name?: string };
  if (!d.token || !d.connection_url) throw new Error("vaani trigger-call: no token in response");
  return { token: d.token, connectionUrl: d.connection_url, roomName: d.room_name ?? "" };
}
