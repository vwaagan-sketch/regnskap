"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Save, UserPlus } from "lucide-react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import type { EmployeeRow } from "@/db/payroll-repo";
import { oreToInput } from "@/lib/money";
import { saveEmployeeAction } from "../actions";

export default function EmployeeForm({ employee }: { employee?: EmployeeRow }) {
  const [state, action, pending] = useActionState(saveEmployeeAction, { ok: false, errors: [] });
  const [payType, setPayType] = useState<"fast" | "time">(employee?.pay_type ?? "fast");
  const formRef = useRef<HTMLFormElement>(null);
  const e = employee;

  useEffect(() => {
    if (state.ok && !e) {
      formRef.current?.reset();
      setPayType("fast");
    }
  }, [state, e]);

  return (
    <Card title={e ? `Rediger ${e.name}` : "Ny ansatt"} className="h-fit">
      <form ref={formRef} action={action} className="grid gap-4 p-5">
        {e && <input type="hidden" name="id" value={e.id} />}
        <Field label="Navn"><input name="name" defaultValue={e?.name} className={inputClass} required /></Field>
        <Field label="Fødselsnummer eller D-nummer"><input name="national_id" inputMode="numeric" defaultValue={e?.national_id} className={inputClass} required /></Field>
        <Field label="Adresse"><input name="address" defaultValue={e?.address} className={inputClass} required /></Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Postnr."><input name="postal_code" defaultValue={e?.postal_code} className={inputClass} required /></Field>
          <Field label="Sted"><input name="city" defaultValue={e?.city} className={inputClass} required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="E-post"><input name="email" type="email" defaultValue={e?.email ?? ""} className={inputClass} /></Field>
          <Field label="Kontonummer"><input name="bank_account" inputMode="numeric" defaultValue={e?.bank_account ?? ""} className={inputClass} /></Field>
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Arbeidsforhold</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Startdato"><input name="start_date" type="date" defaultValue={e?.start_date} className={inputClass} required /></Field>
          <Field label="Sluttdato"><input name="end_date" type="date" defaultValue={e?.end_date ?? ""} className={inputClass} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arbeidsforhold-ID" hint="Fritt valgt, f.eks. 1"><input name="employment_id" defaultValue={e?.employment_id ?? "1"} className={inputClass} required /></Field>
          <Field label="Yrkeskode (STYRK-08)" hint="7 siffer"><input name="occupation_code" inputMode="numeric" defaultValue={e?.occupation_code} className={inputClass} required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stillingsprosent"><input name="position_pct" inputMode="decimal" defaultValue={String(e?.position_pct ?? 100).replace(".", ",")} className={inputClass} required /></Field>
          <Field label="Timer per uke i full stilling"><input name="hours_per_week" inputMode="decimal" defaultValue={String(e?.hours_per_week ?? 37.5).replace(".", ",")} className={inputClass} required /></Field>
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Lønn og skatt</p>
        <Field label="Avlønning">
          <select name="pay_type" value={payType} onChange={(ev) => setPayType(ev.target.value as "fast" | "time")} className={inputClass}>
            <option value="fast">Fastlønn per måned</option>
            <option value="time">Timelønn</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {payType === "fast" ? (
            <Field label="Månedslønn (kr)"><input name="monthly_salary" inputMode="decimal" defaultValue={e?.monthly_salary_ore ? oreToInput(e.monthly_salary_ore) : ""} className={inputClass} required /></Field>
          ) : (
            <Field label="Timesats (kr)"><input name="hourly_rate" inputMode="decimal" defaultValue={e?.hourly_rate_ore ? oreToInput(e.hourly_rate_ore) : ""} className={inputClass} required /></Field>
          )}
          <Field label="Trekkprosent" hint="Fra skattekortet"><input name="tax_percent" inputMode="numeric" defaultValue={e?.tax_percent ?? ""} className={inputClass} required /></Field>
        </div>
        {state.errors.length > 0 && <Alert kind="error">{state.errors.join(". ")}</Alert>}
        {state.ok && <Alert kind="success">{e ? "Endringene er lagret" : "Den ansatte er lagt til"}</Alert>}
        <Button disabled={pending}>
          {e ? <Save className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} {pending ? "Lagrer …" : e ? "Lagre endringer" : "Legg til ansatt"}
        </Button>
      </form>
    </Card>
  );
}
