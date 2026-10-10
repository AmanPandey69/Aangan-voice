import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as startCall } from "@/app/api/call/start/route";
import { freshServices } from "./helpers";
import { DISCLOSURE_LINE } from "@/lib/rules/copy";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://aangan-voice.vercel.app/api/call/start", { method: "POST", headers: { origin: "https://aangan-voice.vercel.app", ...headers } });

afterEach(() => { vi.unstubAllGlobals(); delete process.env.VAANI_API_KEY; delete process.env.VAANI_AGENT_ID; });

describe("POST /api/call/start", () => {
  it("is unavailable until Vaani is configured", async () => {
    freshServices();
    expect((await startCall(req())).status).toBe(503);
  });

  it("starts a WebRTC session with the disclosure greeting, and limits each visitor", async () => {
    freshServices();
    process.env.VAANI_API_KEY = "vaani_x"; process.env.VAANI_AGENT_ID = "agent-uuid";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: "tok", connection_url: "wss://rtc.vaanivoice.ai", room_name: "room_1" })));
    vi.stubGlobal("fetch", fetchMock);
    const ok = await startCall(req({ "x-forwarded-for": "1.2.3.4" }));
    expect(await ok.json()).toEqual({ token: "tok", connectionUrl: "wss://rtc.vaanivoice.ai", roomName: "room_1" });
    const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe("https://api.vaanivoice.ai/api/trigger-call/");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe("vaani_x");
    expect(JSON.parse(String(init.body))).toMatchObject({ agent_id: "agent-uuid", medium: "webrtc", primary_language: "en", welcome_message: DISCLOSURE_LINE });
    for (let i = 0; i < 3; i++) await startCall(req({ "x-forwarded-for": "1.2.3.4" }));
    expect((await startCall(req({ "x-forwarded-for": "1.2.3.4" }))).status).toBe(429);
    expect((await startCall(req({ "x-forwarded-for": "5.6.7.8" }))).status).toBe(200);
  });

  it("rejects requests from other websites", async () => {
    freshServices();
    process.env.VAANI_API_KEY = "vaani_x"; process.env.VAANI_AGENT_ID = "agent-uuid";
    expect((await startCall(req({ origin: "https://evil.example" }))).status).toBe(403);
  });

  it("reports a Vaani failure without leaking details", async () => {
    freshServices();
    process.env.VAANI_API_KEY = "vaani_x"; process.env.VAANI_AGENT_ID = "agent-uuid";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const res = await startCall(req({ "x-forwarded-for": "9.9.9.9" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/500|vaani/i);
  });
});
