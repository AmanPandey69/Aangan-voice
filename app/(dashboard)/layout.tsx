import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth/session";
import { adapterModes, services } from "@/lib/container";
import { FX } from "@/app/fx/fx";
import { NavLinks } from "@/app/fx/nav";
import { CommandPalette, PaletteTrigger, type PaletteItem } from "@/app/fx/palette";
import { displayPhone } from "@/lib/phone";
import { Logo } from "@/app/logo";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");
  const s = services();
  const modes = adapterModes(s);
  const mocks = Object.entries(modes).filter(([, v]) => v === "mock" || v === "memory").map(([k]) => k);
  const items: PaletteItem[] = (await s.repo.listLeads({ limit: 300 })).map((l) => ({
    id: l.id, name: l.name ?? "Unknown caller", phone: displayPhone(l.phone), locality: l.locality ?? "", verdict: l.verdict,
  }));
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/today" className="brand"><Logo /><span className="wordmark">Aangan</span><span className="wordmark-sub">Studio</span></Link>
        <nav>
          <NavLinks />
          <PaletteTrigger />
          <form action="/api/auth/logout" method="post"><button className="link">Sign out</button></form>
        </nav>
      </header>
      {mocks.length > 0 && <div className="banner">Mock mode for: {mocks.join(", ")}. Data and messages are not real.</div>}
      <main className="content">{children}</main>
      <FX />
      <CommandPalette items={items} />
    </div>
  );
}
