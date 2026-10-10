import { LoginForm } from "./form";
import { MEDIA } from "@/config/media";

export const metadata = { title: "Sign in · Aangan Studio", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const configured = Boolean(process.env.DASHBOARD_PASSWORD);
  return (
    <main className="login">
      <div className="login-media" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MEDIA.loginPoster} alt="" />
        <video autoPlay muted loop playsInline poster={MEDIA.loginPoster}><source src={MEDIA.loginVideo} type="video/mp4" /></video>
        <div className="login-quote">Every home starts with a conversation.</div>
      </div>
      <div className="login-side">
        <div className="login-card rise">
          <div className="brand"><span className="wordmark">Aangan</span><span className="wordmark-sub">Studio</span></div>
          <h1>Welcome back.</h1>
          <p>Sign in to see today&apos;s consultations and enquiries.</p>
          <ul className="login-tags" aria-label="What the assistant does">
            <li>Answers 24×7</li><li>Books on the call</li><li>Brief in your inbox</li>
          </ul>
          {configured ? <LoginForm next={next ?? "/today"} /> : <p>DASHBOARD_PASSWORD is not set. Set it in the environment to enable sign-in.</p>}
          <div className="login-foot">Video: <a href="https://mixkit.co/" target="_blank" rel="noreferrer">Mixkit</a></div>
        </div>
      </div>
    </main>
  );
}
