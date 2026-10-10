"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/calls", label: "Enquiries" },
  { href: "/review", label: "Review queue" },
  { href: "/costs", label: "Costs" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href || path.startsWith(`${l.href}/`) ? "active" : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
