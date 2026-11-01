"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import { addCustomer, lookupCustomer } from "./actions";

export default function CustomerForm() {
  const [state, action, pending] = useActionState(addCustomer, { ok: false, errors: [] });
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  function lookup() {
    const el = formRef.current?.elements.namedItem("org_no") as HTMLInputElement;
    setLookupError(null);
    startLookup(async () => {
      const r = await lookupCustomer(el.value);
      if ("error" in r) return setLookupError(r.error);
      for (const k of ["name", "address", "postal_code", "city"] as const) {
        (formRef.current?.elements.namedItem(k) as HTMLInputElement).value = r[k];
      }
    });
  }

  return (
    <Card title="Ny kunde" className="h-fit">
      <form ref={formRef} action={action} className="grid gap-4 p-5">
        <Field label="Org.nr (for bedrifter)">
          <div className="flex gap-2">
            <input name="org_no" inputMode="numeric" className={inputClass} placeholder="Valgfritt" />
            <Button type="button" variant="secondary" onClick={lookup} disabled={looking} aria-label="Hent fra Brreg"><Search className="h-4 w-4" /></Button>
          </div>
        </Field>
        {lookupError && <Alert kind="error">{lookupError}</Alert>}
        <Field label="Navn"><input name="name" className={inputClass} required /></Field>
        <Field label="E-post"><input name="email" type="email" className={inputClass} /></Field>
        <Field label="Adresse"><input name="address" className={inputClass} required /></Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Postnr."><input name="postal_code" className={inputClass} required /></Field>
          <Field label="Sted"><input name="city" className={inputClass} required /></Field>
        </div>
        {state.errors.length > 0 && <Alert kind="error">{state.errors.join(". ")}</Alert>}
        {state.ok && <Alert kind="success">Kunden er lagt til</Alert>}
        <Button disabled={pending}><UserPlus className="h-4 w-4" /> {pending ? "Lagrer …" : "Legg til kunde"}</Button>
      </form>
    </Card>
  );
}
