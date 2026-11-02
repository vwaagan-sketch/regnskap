"use client";

import { useActionState, useEffect, useRef } from "react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import { passwordAction, profileAction } from "./actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(profileAction, { error: null, ok: false });
  return (
    <Card title="Om deg">
      <form action={action} className="grid gap-4 p-5">
        <Field label="Navn"><input name="name" defaultValue={name} autoComplete="name" required className={inputClass} /></Field>
        <Field label="E-post" hint="Brukes til innlogging">
          <input name="email" type="email" defaultValue={email} autoComplete="email" required className={inputClass} />
        </Field>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.ok && <Alert kind="success">Lagret</Alert>}
        <div><Button disabled={pending}>{pending ? "Lagrer …" : "Lagre"}</Button></div>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(passwordAction, { error: null, ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <Card title="Bytt passord">
      <form ref={ref} action={action} className="grid gap-4 p-5">
        <Field label="Nåværende passord">
          <input name="current" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        <Field label="Nytt passord" hint="Minst 10 tegn">
          <input name="new" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
        </Field>
        <Field label="Gjenta nytt passord">
          <input name="new2" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
        </Field>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.ok && <Alert kind="success">Passordet er byttet. Andre innlogginger er logget ut.</Alert>}
        <div><Button disabled={pending}>{pending ? "Bytter …" : "Bytt passord"}</Button></div>
      </form>
    </Card>
  );
}
