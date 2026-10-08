import { env, requireSecret } from "@/lib/env";
import { hmacBase64Url, safeEqual } from "@/lib/security/hmac";

/** Signed, expiring token for the "Acknowledge" link: base64url(notificationId.exp).sig */
const TTL_DAYS = 14;

export function makeAckToken(notificationId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + TTL_DAYS * 86400;
  const body = Buffer.from(`${notificationId}.${exp}`).toString("base64url");
  return `${body}.${hmacBase64Url(requireSecret(env.ackTokenSecret(), "ACK_TOKEN_SECRET"), body)}`;
}

export function verifyAckToken(token: string | null, now = Date.now()): { notificationId: string } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, hmacBase64Url(requireSecret(env.ackTokenSecret(), "ACK_TOKEN_SECRET"), body))) return null;
  const [notificationId, expStr] = Buffer.from(body, "base64url").toString().split(".");
  if (!notificationId || !(Number(expStr) * 1000 > now)) return null;
  return { notificationId };
}
