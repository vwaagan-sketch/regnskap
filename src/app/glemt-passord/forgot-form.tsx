"use client";

import { useActionState } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { forgotAction } from "./actions";

export default function ForgotForm() {
  const [state, action, pending] = useActionState(forgotAction, { sent: false, error: null });
  if (state.sent) {
    return (
      <Alert kind="success">
        Hvis e-postadressen har en konto, har vi sendt en lenke for å lage nytt passord. Sjekk innboksen (og søppelpost). Lenken virker i én time.
      </Alert>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <p className="text-sm text-slate-600">Skriv inn e-postadressen du logger inn med, så sender vi deg en lenke.</p>
      <Field label="E-post">
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Button disabled={pending} className="w-full py-2.5">{pending ? "Sender …" : "Send lenke"}</Button>
    </form>
  );
}
