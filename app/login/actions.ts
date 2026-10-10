"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";

export async function login(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const ok = checkPassword(String(form.get("password") ?? ""));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return { error: "That password isn't right." };
  }
  (await cookies()).set(SESSION_COOKIE, createSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
  const next = String(form.get("next") ?? "/today");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/today");
}
