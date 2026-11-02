"use client";

import { useActionState } from "react";
import { Alert, Button, Field, inputClass } from "@/components/ui";
import { acceptAction } from "./actions";

export default function AcceptForm({ token, mode, email }: { token: string; mode: "innlogget" | "eksisterende" | "ny"; email: string }) {
  const [state, action, pending] = useActionState(acceptAction, { error: null });
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      {mode === "ny" && (
        <>
          <Field label="Fullt navn">
            <input name="name" autoComplete="name" required className={inputClass} />
          </Field>
          <Field label="Velg passord" hint="Minst 10 tegn">
            <input name="password" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
          </Field>
          <Field label="Gjenta passord">
            <input name="password2" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
          </Field>
        </>
      )}
      {mode === "eksisterende" && (
        <Field label="Passordet ditt">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
      )}
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <Button disabled={pending} className="w-full py-2.5">
        {pending ? "Godtar …" : mode === "ny" ? "Opprett bruker og godta" : "Godta invitasjonen"}
      </Button>
    </form>
  );
}
