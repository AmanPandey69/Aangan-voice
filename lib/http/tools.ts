import { services, type Services } from "@/lib/container";
import { json, parseJson } from "./respond";

/** Shared handling for mid-call tool endpoints: auth, parsing, provider envelope. */
export async function handleTool(
  req: Request,
  fn: (s: Services, ctx: { callId: string | null; callerPhone: string | null; args: Record<string, unknown> }) => Promise<Record<string, unknown>>,
) {
  const s = services();
  const raw = await req.text();
  if (!s.voice.verifyToolRequest(raw, req.headers)) return json({ error: "unauthorised" }, 401);
  const body = parseJson(raw);
  if (body === undefined) return json({ error: "invalid json" }, 400);
  const ctx = s.voice.parseToolRequest(body);
  const result = await fn(s, ctx);
  return json(s.voice.toolResponse(result, body));
}
