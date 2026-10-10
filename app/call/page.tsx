import { CallWidget } from "./widget";
import { Logo } from "@/app/logo";
import { roomPhoto } from "@/config/media";

export const metadata = { title: "Talk to Aangan Studio", description: "Speak to Aangan Studio's assistant and book a design consultation." };

const HERO = roomPhoto("aangan-call-hero", 1600);
const SPACES = [["Living rooms", roomPhoto("space-living", 500)], ["Bedrooms", roomPhoto("space-bedroom-2", 500)], ["Kitchens", roomPhoto("space-kitchen", 500)]] as const;

const ICON = {
  free: <path d="M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
};
const Ico = ({ d }: { d: keyof typeof ICON }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[d]}</svg>
);

export default async function CallPage({ searchParams }: { searchParams: Promise<{ embed?: string }> }) {
  const embed = (await searchParams).embed === "1";
  const card = (
    <div className="cp-card">
      <CallWidget />
      <p className="call-note">You&apos;ll be speaking with Aangan Studio&apos;s AI assistant. Calls are recorded so our designers can follow up. Please allow microphone access when asked.</p>
    </div>
  );
  if (embed) return <main className="cp embed">{card}</main>;

  return (
    <main className="cp">
      <header className="cp-top">
        <div className="brand"><Logo /><span className="wordmark">Aangan</span><span className="wordmark-sub">Studio · Pune</span></div>
        <span className="cp-top-note">Interior design for homes in Pune &amp; PCMC</span>
      </header>

      <section className="cp-hero">
        <div className="cp-text rise">
          <div className="pill-eyebrow"><i />Answering now · 24×7</div>
          <h1>Talk to us about your <em>home.</em></h1>
          <p className="cp-lede">Tell our assistant about your project in a few minutes and book a free design consultation, at the studio or at your site.</p>
          {card}
          <ul className="cp-trust">
            <li><span><Ico d="free" /></span>Free consultation</li>
            <li><span><Ico d="clock" /></span>Book in one call</li>
            <li><span><Ico d="pin" /></span>Studio or site visit</li>
          </ul>
        </div>

        <div className="cp-visual rise" style={{ ["--i" as string]: 2 }}>
          <div className="cp-photo" style={{ backgroundImage: `url("${HERO}")` }} role="img" aria-label="A finished living room" />
          <div className="float-card cp-float cp-float-a">
            <span className="cp-float-ico"><Logo size={26} /></span>
            <span><small>Your assistant</small><b>Ready to talk</b></span>
            <span className="wave-bars" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</span>
          </div>
          <div className="float-card cp-float cp-float-b">
            <small>Design consultation</small>
            <b>60 minutes, free</b>
            <span className="muted">With a studio designer</span>
          </div>
        </div>
      </section>

      <section className="cp-spaces rise" style={{ ["--i" as string]: 4 }}>
        <h2>Spaces we design</h2>
        <div className="cp-spaces-row">
          {SPACES.map(([label, src]) => (
            <figure key={label} style={{ backgroundImage: `url("${src}")` }}><figcaption>{label}</figcaption></figure>
          ))}
        </div>
      </section>
      <footer className="cp-foot">Aangan Studio · Pune</footer>
    </main>
  );
}
