import { env, requireSecret } from "@/lib/env";
import { hmacBase64Url, safeEqual } from "@/lib/security/hmac";

export const SESSION_COOKIE = "aangan_session";
export const SESSION_TTL_SECONDS = 12 * 3600;

/** The signing key changes whenever the dashboard password changes, which logs everyone out. */
function key(): string {
  return `${requireSecret(env.ackTokenSecret(), "ACK_TOKEN_SECRET")}:${env.dashboardPassword() ?? ""}`;
}

export function createSession(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  return `${exp}.${hmacBase64Url(key(), `session.${exp}`)}`;
}

export function isValidSession(value: string | undefined | null, now = Date.now()): boolean {
  if (!value || !env.dashboardPassword()) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  return safeEqual(sig, hmacBase64Url(key(), `session.${exp}`));
}

export function checkPassword(input: string): boolean {
  const pw = env.dashboardPassword();
  return Boolean(pw) && safeEqual(hmacBase64Url("pw", input), hmacBase64Url("pw", pw!));
}
