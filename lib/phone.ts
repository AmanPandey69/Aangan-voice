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
