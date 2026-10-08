import { LoginForm } from "./form";

export const metadata = { title: "Sign in · Aangan calls", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const configured = Boolean(process.env.DASHBOARD_PASSWORD);
  return (
    <main className="login">
      <div className="card login-card">
        <div className="brand">Aangan Studio</div>
        <h1>Enquiry dashboard</h1>
        {configured ? <LoginForm next={next ?? "/calls"} /> : (
          <p className="muted">DASHBOARD_PASSWORD is not set. Set it in the environment to enable sign-in.</p>
        )}
      </div>
    </main>
  );
}
