/**
 * Starts an in-browser (WebRTC) call with the Vaani agent.
 * Docs: https://docs.vaanivoice.ai/api-reference/trigger-call (medium "webrtc"), checked 2026-10-10.
 * Returns a LiveKit token + server URL; the browser joins with livekit-client.
 */
export interface WebCallSession { token: string; connectionUrl: string; roomName: string }

const API = "https://api.vaanivoice.ai";
/** Seconds of caller silence before the agent warns / hangs up, on web calls. */
const WEB_IDLE_SECONDS = 30;

/**
 * Web calls started through the API were being hung up by the agent's 10-second
 * idle rule (0:13 every time). trigger-call accepts `modify_agent.experience`
 * (the full section, deep-merged), so send the agent's own experience settings
 * with longer idle timers. Everything else stays as configured in Vaani.
 */
async function webExperience(apiKey: string, agentId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${API}/api/agents/${agentId}`, { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const exp = ((await res.json()) as { experience?: { settings?: { idle_conversation_settings?: Record<string, unknown> } } }).experience;
    const idle = exp?.settings?.idle_conversation_settings;
    if (!exp?.settings || !idle) return null;
    const atLeast = (v: unknown) => Math.max(typeof v === "number" ? v : 0, WEB_IDLE_SECONDS);
    return {
      ...exp,
      settings: {
        ...exp.settings,
        idle_conversation_settings: {
          ...idle,
          idle_call_hangup_timeout: atLeast(idle.idle_call_hangup_timeout),
          idle_call_warning_timeout: atLeast(idle.idle_call_warning_timeout),
          initial_idle_call_hungup_timeout: atLeast(idle.initial_idle_call_hungup_timeout),
          initial_idle_call_warning_timeout: Math.max(Number(idle.initial_idle_call_warning_timeout) || 0, 15),
        },
      },
    };
  } catch {
    return null;
  }
}

export async function startVaaniWebCall(apiKey: string, agentId: string): Promise<WebCallSession> {
  const experience = await webExperience(apiKey, agentId);
  const res = await fetch(`${API}/api/trigger-call/`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    // Voice, language and greeting come from the agent as configured in Vaani
    // (its greeting already discloses AI + recording).
    body: JSON.stringify({ agent_id: agentId, medium: "webrtc", ...(experience ? { modify_agent: { experience } } : {}) }),
  });
  if (!res.ok) throw new Error(`vaani trigger-call ${res.status}`);
  const d = (await res.json()) as { token?: string; connection_url?: string; room_name?: string };
  if (!d.token || !d.connection_url) throw new Error("vaani trigger-call: no token in response");
  return { token: d.token, connectionUrl: d.connection_url, roomName: d.room_name ?? "" };
}
