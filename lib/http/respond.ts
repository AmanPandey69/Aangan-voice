import { NextResponse } from "next/server";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export function parseJson(raw: string): unknown | undefined {
  try { return JSON.parse(raw); } catch { return undefined; }
}

/** Log without personal data or secrets: ids and error messages only. */
export function logError(where: string, err: unknown, ids: Record<string, string | null | undefined> = {}) {
  console.error(JSON.stringify({ where, error: err instanceof Error ? err.message : String(err), ...ids }));
}
