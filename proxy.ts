import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth/session";

/** The customer site (its own address) only ever shows the call page. */
const CUSTOMER_HOSTS = (process.env.CUSTOMER_HOSTS ?? "aangan-call.vercel.app").split(",").map((h) => h.trim().toLowerCase());
const CUSTOMER_ALLOWED = ["/call", "/api/call/start"];
const DASHBOARD = ["/", "/today", "/calendar", "/calls", "/review", "/costs"];

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const path = req.nextUrl.pathname;

  if (CUSTOMER_HOSTS.includes(host)) {
    if (path === "/") return NextResponse.rewrite(new URL("/call", req.url));
    if (CUSTOMER_ALLOWED.includes(path)) return NextResponse.next();
    return NextResponse.redirect(new URL("/", req.url));
  }

  // The call page lives only on the customer site.
  if (path === "/call") return NextResponse.redirect(`https://${CUSTOMER_HOSTS[0]}/${req.nextUrl.search}`);

  // Dashboard: optimistic auth check (the dashboard layout checks again server-side).
  const isDashboard = DASHBOARD.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)));
  if (!isDashboard || isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next.js internals and static files.
  matcher: ["/((?!_next/|favicon\\.ico|.*\\.(?:png|jpg|svg|ico|webp|mp4)$).*)"],
};
