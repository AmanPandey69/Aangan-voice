/** Normalise Indian phone numbers to E.164 so a redial matches the first call. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  const d = digits.replace(/^\+/, "");
  if (/^\d{10}$/.test(d)) return `+91${d}`;
  if (/^0\d{10}$/.test(d)) return `+91${d.slice(1)}`;
  if (/^91\d{10}$/.test(d)) return `+${d}`;
  return digits.startsWith("+") ? digits : d ? `+${d}` : null;
}

/**
 * Numbers starting +910000 are not valid Indian mobiles; the smoke test uses
 * them so a test call against production never reaches HubSpot or the designer.
 */
export function isTestNumber(phone: string | null | undefined): boolean {
  return Boolean(phone && /^\+910000\d{6}$/.test(phone));
}

/** Online (browser) calls have no caller number; the lead is keyed by the call id instead. */
export function hasRealPhone(phone: string | null | undefined): phone is string {
  return Boolean(phone && /^\+\d{8,15}$/.test(phone));
}

/** How to show a lead's phone to people. */
export function displayPhone(phone: string): string {
  return hasRealPhone(phone) ? phone : "Not captured (online call)";
}
