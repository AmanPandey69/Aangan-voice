import { LoginForm } from "./form";
import { MEDIA } from "@/config/media";

export const metadata = { title: "Sign in · Aangan Studio", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const configured = Boolean(process.env.DASHBOARD_PASSWORD);
  return (
    <main className="login">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="login-poster" src={MEDIA.loginPoster} alt="" aria-hidden="true" />
      <video className="login-video" autoPlay muted loop playsInline preload="auto" poster={MEDIA.loginPoster} aria-hidden="true">
        <source src={MEDIA.loginVideo} type="video/mp4" />
      </video>
      <div className="login-card">
        <div className="brand"><span className="brand-mark">A</span> Aangan Studio</div>
        <h1>Enquiry studio</h1>
        <p>Every call, verdict and consultation in one place.</p>
        {configured ? <LoginForm next={next ?? "/calls"} /> : (
          <p>DASHBOARD_PASSWORD is not set. Set it in the environment to enable sign-in.</p>
        )}
      </div>
      <div className="login-foot">Video: <a href="https://mixkit.co/" target="_blank" rel="noreferrer">Mixkit</a></div>
    </main>
  );
}
