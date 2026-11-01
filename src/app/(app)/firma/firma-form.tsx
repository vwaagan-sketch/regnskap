"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Search, Check } from "lucide-react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import type { CompanyRow } from "@/db/company-repo";
import { lookupOrgNo, saveFirma } from "./actions";

export default function FirmaForm({ company }: { company: CompanyRow | null }) {
  const [state, action, pending] = useActionState(saveFirma, { ok: false, errors: [] });
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function setValue(name: string, value: string | boolean) {
    const el = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = String(value);
  }

  function lookup() {
    const orgNo = (formRef.current?.elements.namedItem("org_no") as HTMLInputElement).value;
    setLookupError(null);
    startLookup(async () => {
      const r = await lookupOrgNo(orgNo);
      if ("error" in r) return setLookupError(r.error);
      Object.entries(r).forEach(([k, v]) => setValue(k, v));
    });
  }

  return (
    <Card>
      <form ref={formRef} action={action} className="grid gap-5 p-5 sm:grid-cols-2">
        <Field label="Organisasjonsnummer" className="sm:col-span-2">
          <div className="flex gap-2">
            <input name="org_no" inputMode="numeric" defaultValue={company?.org_no} placeholder="123 456 789" className={inputClass} required />
            <Button type="button" variant="secondary" onClick={lookup} disabled={looking}>
              <Search className="h-4 w-4" /> {looking ? "Henter …" : "Hent fra Brreg"}
            </Button>
          </div>
        </Field>
        {lookupError && <div className="sm:col-span-2"><Alert kind="error">{lookupError}</Alert></div>}
        <Field label="Firmanavn" className="sm:col-span-2">
          <input name="name" defaultValue={company?.name} className={inputClass} required />
        </Field>
        <Field label="Adresse" className="sm:col-span-2">
          <input name="address" defaultValue={company?.address} className={inputClass} required />
        </Field>
        <Field label="Postnummer">
          <input name="postal_code" defaultValue={company?.postal_code} className={inputClass} required />
        </Field>
        <Field label="Sted">
          <input name="city" defaultValue={company?.city} className={inputClass} required />
        </Field>
        <Field label="Kontonummer for innbetaling" hint="11 siffer" className="sm:col-span-2">
          <input name="bank_account" inputMode="numeric" defaultValue={company?.bank_account} placeholder="1234 56 78903" className={inputClass} required />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="vat_registered" defaultChecked={company?.vat_registered ?? true} className="h-4 w-4 rounded accent-indigo-600" />
          Registrert i Merverdiavgiftsregisteret
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="in_business_register" defaultChecked={company?.in_business_register ?? true} className="h-4 w-4 rounded accent-indigo-600" />
          Registrert i Foretaksregisteret
        </label>
        <div className="flex flex-col gap-3 sm:col-span-2">
          {state.errors.length > 0 && <Alert kind="error">{state.errors.join(". ")}</Alert>}
          {state.ok && <Alert kind="success"><span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Lagret</span></Alert>}
          <div><Button disabled={pending}>{pending ? "Lagrer …" : "Lagre"}</Button></div>
        </div>
      </form>
    </Card>
  );
}
