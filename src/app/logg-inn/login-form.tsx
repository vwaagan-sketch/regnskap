"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, { error: null, user: "" });
  return (
    <form action={action} className="mt-6 grid gap-3">
      <input type="hidden" name="neste" value={next} />
      <label className="grid gap-1">
        <span>Brukernavn</span>
        <input name="bruker" defaultValue={state.user} autoComplete="username" required className="rounded border p-2" />
      </label>
      <label className="grid gap-1">
        <span>Passord</span>
        <input name="passord" type="password" autoComplete="current-password" required className="rounded border p-2" />
      </label>
      {state.error && <p className="text-red-700">{state.error}</p>}
      <button disabled={pending} className="rounded bg-black p-2 text-white disabled:opacity-50">
        {pending ? "Logger inn …" : "Logg inn"}
      </button>
    </form>
  );
}
