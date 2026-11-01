"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, { error: null, user: "" });
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="neste" value={next} />
      <Field label="Brukernavn">
        <input name="bruker" defaultValue={state.user} autoComplete="username" required className={inputClass} />
      </Field>
      <Field label="Passord">
        <input name="passord" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Button disabled={pending} className="w-full py-2.5">{pending ? "Logger inn …" : "Logg inn"}</Button>
    </form>
  );
}
