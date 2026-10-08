import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Optimistic auth check for dashboard pages (the dashboard layout checks
 * again server-side). API routes authenticate themselves with signatures,
 * tool secrets, signed ack tokens or the cron secret.
 */
export function proxy(req: NextRequest) {
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/calls/:path*", "/review/:path*", "/costs/:path*"],
};
