"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import type { PayrollSettings } from "@/db/payroll-repo";
import { AGA_ZONES, AGA_ZONE_LABEL } from "@/lib/payroll";
import { saveSettingsAction } from "../actions";

export default function SettingsForm({ settings }: { settings: PayrollSettings | null }) {
  const [state, action, pending] = useActionState(saveSettingsAction, { ok: false, errors: [] });
  return (
    <Card className="max-w-xl">
      <form action={action} className="grid gap-4 p-5">
        <Field label="Org.nr. for virksomheten (underenheten)" hint="Bedriftsnummeret til underenheten der de ansatte jobber, fra Enhetsregisteret. Ikke det samme som org.nr. for selskapet.">
          <input name="business_unit_org_no" inputMode="numeric" defaultValue={settings?.business_unit_org_no ?? ""} className={inputClass} required />
        </Field>
        <Field label="Sone for arbeidsgiveravgift" hint="Bestemmes av hvor virksomheten ligger. Sone 1a og 4a (fribeløp) støttes ikke ennå.">
          <select name="aga_zone" defaultValue={settings?.aga_zone ?? "1"} className={inputClass}>
            {AGA_ZONES.map((z) => <option key={z} value={z}>{AGA_ZONE_LABEL[z]}</option>)}
          </select>
        </Field>
        <Field label="Feriepengesats" hint="10,2 % er lovens minimum (4 uker og 1 dag). 12 % gjelder når det er avtalt fem ukers ferie.">
          <select name="holiday_pay_rate_bp" defaultValue={String(settings?.holiday_pay_rate_bp ?? 1020)} className={inputClass}>
            <option value="1020">10,2 %</option>
            <option value="1200">12 %</option>
          </select>
        </Field>
        {state.errors.length > 0 && <Alert kind="error">{state.errors.join(". ")}</Alert>}
        {state.ok && <Alert kind="success">Innstillingene er lagret</Alert>}
        <Button disabled={pending}><Save className="h-4 w-4" /> {pending ? "Lagrer …" : "Lagre"}</Button>
      </form>
    </Card>
  );
}
