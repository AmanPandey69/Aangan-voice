"use client";
import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>{pending ? "Signing in…" : <>Sign in <span className="arrow">→</span></>}</button>
    </form>
  );
}
