import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth/session";
import { adapterModes } from "@/lib/container";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");
  const modes = adapterModes();
  const mocks = Object.entries(modes).filter(([, v]) => v === "mock" || v === "memory").map(([k]) => k);
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/calls" className="brand">Aangan Studio · Enquiries</Link>
        <nav>
          <Link href="/calls">Calls</Link>
          <Link href="/review">Review queue</Link>
          <Link href="/costs">Costs</Link>
          <form action="/api/auth/logout" method="post"><button className="link">Sign out</button></form>
        </nav>
      </header>
      {mocks.length > 0 && <div className="banner">Mock mode for: {mocks.join(", ")}. Data and messages are not real.</div>}
      <main className="content">{children}</main>
    </div>
  );
}
