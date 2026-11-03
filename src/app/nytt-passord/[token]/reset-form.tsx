"use client";

import { useActionState } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { resetAction } from "./actions";

export default function ResetForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(resetAction, { error: null });
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      <Field label="Nytt passord" hint="Minst 10 tegn">
        <input name="password" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
      </Field>
      <Field label="Gjenta nytt passord">
        <input name="password2" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
      </Field>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Button disabled={pending} className="w-full py-2.5">{pending ? "Lagrer …" : "Lagre og logg inn"}</Button>
    </form>
  );
}
