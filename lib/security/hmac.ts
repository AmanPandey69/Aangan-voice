import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}
export function hmacBase64(secret: string | Buffer, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64");
}
export function hmacBase64Url(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Constant-time string compare; false on length mismatch. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
