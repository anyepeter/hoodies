"use client";

import { useActionState, useState } from "react";
import { field, label } from "@/components/admin/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="from" value={from} />
      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            required
            autoFocus
            autoComplete="current-password"
            className={`${field} h-11 pr-16`}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? "login-error" : undefined}
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-semibold text-zinc-500 hover:text-ink">
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {state.error && (
        <p id="login-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-brand" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand text-sm font-bold text-white transition hover:bg-brand-dark disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
