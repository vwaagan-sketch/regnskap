"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Money, cx, inputClass } from "@/components/ui";
import { ACCOUNT_CLASSES, type AccountRow } from "@/db/account-repo";
import { createAccountAction, updateAccountAction } from "./actions";

const VAT_OPTIONS = [
  ["", "Ingen standard"],
  ["high", "25 %"],
  ["medium", "15 %"],
  ["low", "12 %"],
  ["zero", "0 % (fritatt)"],
  ["exempt", "Unntatt"],
] as const;
const VAT_SHORT: Record<string, string> = { high: "25 %", medium: "15 %", low: "12 %", zero: "0 %", exempt: "Unntatt" };

function NewAccountForm() {
  const [state, action, pending] = useActionState(createAccountAction, { ok: false, errors: [] });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <Card title="Ny konto" className="h-fit">
      <form ref={ref} action={action} className="grid gap-4 p-5">
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Nummer"><input name="number" inputMode="numeric" maxLength={4} placeholder="3010" className={inputClass} required /></Field>
          <Field label="Navn"><input name="name" placeholder="Salg av kurs" className={inputClass} required /></Field>
        </div>
        <Field label="Standard MVA" hint="Foreslås automatisk når kontoen brukes på bilag og varer">
          <select name="vat_category" className={inputClass}>
            {VAT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        {state.errors.length > 0 && <Alert kind="error">{state.errors.join(". ")}</Alert>}
        {state.ok && <Alert kind="success">Kontoen er opprettet</Alert>}
        <Button disabled={pending}><Plus className="h-4 w-4" /> Opprett konto</Button>
      </form>
    </Card>
  );
}

function AccountRowView({ a }: { a: AccountRow }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateAccountAction, { ok: false, errors: [] });
  useEffect(() => { if (state.ok) setEditing(false); }, [state]);

  if (editing) {
    return (
      <li className="bg-indigo-50/40 px-5 py-3">
        <form action={action} className="grid gap-3 sm:grid-cols-[4rem_minmax(0,1fr)_9rem_auto_auto] sm:items-center">
          <input type="hidden" name="number" value={a.number} />
          <span className="text-sm font-semibold tabular-nums">{a.number}</span>
          <input name="name" defaultValue={a.name} className={inputClass} required />
          <select name="vat_category" defaultValue={a.vat_category ?? ""} className={inputClass}>
            {VAT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={a.active} className="h-4 w-4 accent-indigo-600" /> Aktiv</label>
          <div className="flex gap-1">
            <Button disabled={pending} aria-label="Lagre" className="px-3"><Check className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" aria-label="Avbryt" className="px-3" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
          </div>
          {state.errors.length > 0 && <div className="sm:col-span-5"><Alert kind="error">{state.errors.join(". ")}</Alert></div>}
        </form>
      </li>
    );
  }
  return (
    <li className={cx("group flex items-center gap-4 px-5 py-2.5", !a.active && "opacity-50")}>
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-500">{a.number}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
      <span className="hidden gap-1.5 sm:flex">
        {a.vat_category && <Badge color="indigo">{VAT_SHORT[a.vat_category]}</Badge>}
        {a.custom && <Badge>Egen</Badge>}
        {!a.active && <Badge color="amber">Skjult</Badge>}
      </span>
      {a.used && <Money ore={a.balance_ore} className="w-28 text-right text-sm text-slate-500" />}
      <button onClick={() => setEditing(true)} aria-label={`Rediger ${a.number}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100">
        <Pencil className="h-4 w-4" />
      </button>
    </li>
  );
}

export default function AccountsView({ accounts }: { accounts: AccountRow[] }) {
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return accounts.filter((a) => (showHidden || a.active) && (!n || `${a.number} ${a.name}`.toLowerCase().includes(n)));
  }, [accounts, q, showHidden]);
  const classes = Object.keys(ACCOUNT_CLASSES).filter((c) => filtered.some((a) => a.number.startsWith(c)));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid min-w-0 grid-cols-1 gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk på nummer eller navn …" className={inputClass} />
          <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="h-4 w-4 accent-indigo-600" /> Vis skjulte
          </label>
        </div>
        {classes.map((c) => (
          <Card key={c} title={`${c} · ${ACCOUNT_CLASSES[c]}`}>
            <ul className="divide-y divide-slate-100">
              {filtered.filter((a) => a.number.startsWith(c)).map((a) => <AccountRowView key={a.number} a={a} />)}
            </ul>
          </Card>
        ))}
        {classes.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">Ingen kontoer matcher søket.</Card>}
      </div>
      <div className="grid h-fit gap-4 lg:sticky lg:top-6">
        <NewAccountForm />
        <p className="px-1 text-xs text-slate-400">Kontoer som er brukt i regnskapet kan ikke slettes, men du kan skjule dem. Skjulte kontoer vises ikke i nedtrekkslistene.</p>
      </div>
    </div>
  );
}
