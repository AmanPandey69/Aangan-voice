"use client";
import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

type State = "idle" | "connecting" | "live" | "ended" | "error";

export function CallWidget() {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => () => { void roomRef.current?.disconnect(); }, []);

  async function start() {
    setState("connecting"); setMessage(null); setSeconds(0);
    try {
      // Ask for the microphone first so the browser prompt appears straight away.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());

      const res = await fetch("/api/call/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't connect right now.");

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) audioRef.current?.appendChild(track.attach());
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setAgentSpeaking(speakers.some((p) => p.identity !== room.localParticipant.identity));
      });
      room.on(RoomEvent.Disconnected, () => { setState("ended"); setAgentSpeaking(false); });

      await room.connect(data.connectionUrl, data.token);
      await room.startAudio();
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("live");
    } catch (err) {
      const e = err as Error & { name?: string };
      setMessage(e.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in your browser and try again." : e.message);
      setState("error");
      void roomRef.current?.disconnect();
    }
  }

  async function hangUp() { await roomRef.current?.disconnect(); setState("ended"); }
  async function toggleMute() {
    const room = roomRef.current; if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="call-widget">
      <div ref={audioRef} hidden />
      {state === "live" ? (
        <>
          <div className={`call-orb${agentSpeaking ? " speaking" : ""}`} aria-hidden="true" />
          <p className="call-status" aria-live="polite">{agentSpeaking ? "Assistant is speaking…" : "Listening…"} · {mmss}</p>
          <div className="call-actions">
            <button type="button" className="btn-secondary call-mute" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
            <button type="button" className="btn-coral" onClick={hangUp}>End call</button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="call-start" onClick={start} disabled={state === "connecting"}>
            {state === "connecting" ? "Connecting…" : state === "ended" ? "Call again" : "🎙  Start call"}
          </button>
          {state === "ended" && <p className="call-status">Thanks for calling Aangan Studio. If you booked a consultation, you&apos;ll hear from your designer soon.</p>}
          {message && <p className="call-error" role="alert">{message}</p>}
        </>
      )}
    </div>
  );
}
