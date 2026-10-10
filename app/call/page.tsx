import { CallWidget } from "./widget";
import { MEDIA } from "@/config/media";

export const metadata = { title: "Talk to Aangan Studio", description: "Speak to Aangan Studio's assistant and book a design consultation." };

export default async function CallPage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const embed = (await searchParams).embed === "1";
  return (
    <main className={`login call-page${embed ? " embed" : ""}`}>
      {!embed && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-poster" src={MEDIA.loginPoster} alt="" aria-hidden="true" />
          <video className="login-video" autoPlay muted loop playsInline poster={MEDIA.loginPoster} aria-hidden="true">
            <source src={MEDIA.loginVideo} type="video/mp4" />
          </video>
        </>
      )}
      <div className="login-card call-card">
        <div className="brand"><span className="brand-mark">A</span> Aangan Studio</div>
        <h1>Talk to us about your home</h1>
        <p>Tell our assistant about your project and book a free design consultation, any time of day.</p>
        <CallWidget />
        <p className="call-note">You&apos;ll be speaking with Aangan Studio&apos;s AI assistant. Calls are recorded so our designers can follow up. Please allow microphone access when asked.</p>
      </div>
    </main>
  );
}
