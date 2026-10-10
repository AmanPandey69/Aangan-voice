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
  const [caption, setCaption] = useState<{ who: "agent" | "you"; text: string } | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const meter = useRef<{ ctx?: AudioContext; analysers: AnalyserNode[]; raf?: number }>({ analysers: [] });

  /** Feed a track into the level meter that drives the orb and the wave bars. */
  function listen(track: MediaStreamTrack) {
    const m = meter.current;
    m.ctx ??= new AudioContext();
    void m.ctx.resume();
    const an = m.ctx.createAnalyser();
    an.fftSize = 256;
    m.ctx.createMediaStreamSource(new MediaStream([track])).connect(an);
    m.analysers.push(an);
    if (m.raf) return;
    const buf = new Uint8Array(128);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = () => {
      let lvl = 0;
      const bands = new Array(12).fill(0);
      for (const a of m.analysers) {
        a.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { sum += buf[i]; bands[Math.floor((i / buf.length) * 12)] += buf[i]; }
        lvl = Math.max(lvl, sum / buf.length / 255);
      }
      const level = reduce ? 0 : Math.min(1, lvl * 2.2);
      orbRef.current?.style.setProperty("--lvl", level.toFixed(3));
      waveRef.current?.querySelectorAll("i").forEach((el, i) =>
        (el as HTMLElement).style.setProperty("--h", reduce ? "0.15" : Math.min(1, bands[i] / (m.analysers.length * 11 * 255) * 2.4).toFixed(3)));
      m.raf = requestAnimationFrame(tick);
    };
    m.raf = requestAnimationFrame(tick);
  }
  function stopMeter() {
    const m = meter.current;
    if (m.raf) cancelAnimationFrame(m.raf);
    void m.ctx?.close();
    meter.current = { analysers: [] };
  }

  useEffect(() => {
    if (state !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => () => { void roomRef.current?.disconnect(); stopMeter(); }, []);

  async function start() {
    setState("connecting"); setMessage(null); setSeconds(0); setCaption(null);
    try {
      // Ask for the microphone first so the browser prompt appears straight away.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());

      const res = await fetch("/api/call/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't connect right now.");

      const room = new Room();
      roomRef.current = room;
      // Play the agent through a plain audio element only (no Web Audio on the
      // remote track, which can silence playback in some browsers).
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) audioRef.current?.appendChild(track.attach());
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (!room.canPlaybackAudio) void room.startAudio().catch(() => {}); });
      // Live captions, so callers can see they were heard.
      const who = (identity?: string) => (identity === room.localParticipant.identity ? "you" : "agent");
      room.on(RoomEvent.TranscriptionReceived, (segments, participant) => {
        const text = segments.map((x) => x.text).join(" ").trim();
        if (text) setCaption({ who: who(participant?.identity), text });
      });
      room.registerTextStreamHandler("lk.transcription", async (reader, { identity }) => {
        let text = "";
        for await (const chunk of reader) { text += chunk; setCaption({ who: who(identity), text: text.trim() }); }
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setAgentSpeaking(speakers.some((p) => p.identity !== room.localParticipant.identity));
      });
      room.on(RoomEvent.Disconnected, () => { setState("ended"); setAgentSpeaking(false); stopMeter(); });

      await room.connect(data.connectionUrl, data.token);
      await room.startAudio();
      setState("live");
      const mic = await room.localParticipant.setMicrophoneEnabled(true, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
      if (mic?.track?.mediaStreamTrack) listen(mic.track.mediaStreamTrack);
    } catch (err) {
      const e = err as Error & { name?: string };
      setMessage(e.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in your browser and try again." : e.message);
      setState("error");
      void roomRef.current?.disconnect();
    }
  }

  async function hangUp() { await roomRef.current?.disconnect(); stopMeter(); setState("ended"); }
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
          <div ref={orbRef} className={`call-orb${agentSpeaking ? " speaking" : ""}`} aria-hidden="true" />
          <div ref={waveRef} className="wave" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
          <p className="call-status" aria-live="polite">{agentSpeaking ? "Assistant is speaking…" : "Listening…"} · {mmss}</p>
          {caption && <p className="call-caption"><b>{caption.who === "you" ? "You" : "Assistant"}:</b> {caption.text}</p>}
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
