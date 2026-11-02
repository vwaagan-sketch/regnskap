"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Package, Pencil, Plus, X } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Field, Money, cx, inputClass } from "@/components/ui";
import type { ProductRow } from "@/db/product-repo";
import { oreToInput } from "@/lib/money";
import type { VatCategory } from "@/lib/vat";
import { saveProductAction } from "./actions";

const VAT: [VatCategory, string][] = [["high", "25 %"], ["medium", "15 %"], ["low", "12 %"], ["zero", "0 % (fritatt)"], ["exempt", "Unntatt"]];
const VAT_SHORT: Record<VatCategory, string> = { high: "25 %", medium: "15 %", low: "12 %", zero: "0 %", exempt: "Unntatt" };
const UNITS = ["stk", "timer", "dager", "mnd", "km", "kg", "m", "m²", "lisens", "pakke"];

type RevenueAccount = { number: string; name: string; vat: VatCategory | null };

function ProductForm({ product, accounts, vatRegistered, onDone }: { product: ProductRow | null; accounts: RevenueAccount[]; vatRegistered: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveProductAction, { ok: false, errors: [] });
  const ref = useRef<HTMLFormElement>(null);
  const [account, setAccount] = useState(product?.revenue_account ?? "3000");
  const [vat, setVat] = useState<VatCategory>(product?.vat_category ?? (vatRegistered ? "high" : "exempt"));
  useEffect(() => {
    if (state.ok) { ref.current?.reset(); onDone(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kjør bare når lagringen er ferdig
  }, [state]);

  return (
    <Card title={product ? `Rediger ${product.name}` : "Ny vare eller tjeneste"} className="h-fit"
      action={product && <button onClick={onDone} aria-label="Avbryt" className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}>
      <form ref={ref} action={action} key={product?.id ?? "ny"} className="grid gap-4 p-5">
        {product && <input type="hidden" name="id" value={product.id} />}
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Varenr."><input name="product_no" defaultValue={product?.product_no} placeholder="Auto" className={inputClass} /></Field>
          <Field label="Navn"><input name="name" defaultValue={product?.name} placeholder="Konsulenttime" className={inputClass} required /></Field>
        </div>
        <Field label="Beskrivelse (valgfritt)" hint="Vises på fakturalinjen">
          <input name="description" defaultValue={product?.description ?? ""} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pris eks. MVA (kr)"><input name="price" inputMode="decimal" defaultValue={product ? oreToInput(Number(product.price_ore)) : ""} placeholder="0,00" className={inputClass} required /></Field>
          <Field label="Enhet">
            <input name="unit" list="units" defaultValue={product?.unit ?? "stk"} className={inputClass} />
            <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Inntektskonto">
            <select name="revenue_account" value={account} className={inputClass}
              onChange={(e) => { setAccount(e.target.value); const a = accounts.find((x) => x.number === e.target.value); if (a?.vat && vatRegistered) setVat(a.vat); }}>
              {accounts.map((a) => <option key={a.number} value={a.number}>{a.number} {a.name}</option>)}
            </select>
          </Field>
          <Field label="MVA">
            <select name="vat_category" value={vat} onChange={(e) => setVat(e.target.value as VatCategory)} disabled={!vatRegistered} className={inputClass}>
              {VAT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {!vatRegistered && <input type="hidden" name="vat_category" value="exempt" />}
          </Field>
        </div>
        {product && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={product.active} className="h-4 w-4 accent-indigo-600" /> Aktiv (vises i fakturaskjemaet)</label>
        )}
        {state.errors.length > 0 && <Alert kind="error">{state.errors.join(". ")}</Alert>}
        <Button disabled={pending}>{product ? "Lagre endringer" : <><Plus className="h-4 w-4" /> Legg til</>}</Button>
      </form>
    </Card>
  );
}

export default function ProductsView({ products, revenueAccounts, vatRegistered }: { products: ProductRow[]; revenueAccounts: RevenueAccount[]; vatRegistered: boolean }) {
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [q, setQ] = useState("");
  const done = useCallback(() => setEditing(null), []);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return products.filter((p) => !n || `${p.product_no} ${p.name} ${p.description ?? ""}`.toLowerCase().includes(n));
  }, [products, q]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid h-fit gap-4">
        {products.length > 0 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søk i varer …" className={inputClass} />}
        <Card>
          {products.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title="Ingen varer ennå" text="Legg inn tjenester og varer du selger ofte, med fast pris og MVA." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((p) => (
                <li key={p.id} className={cx("group flex items-center gap-4 px-5 py-3", !p.active && "opacity-50", editing?.id === p.id && "bg-indigo-50/50")}>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Package className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-slate-500">Nr. {p.product_no} · konto {p.revenue_account}{p.description ? ` · ${p.description}` : ""}</p>
                  </div>
                  <span className="hidden sm:block"><Badge color="indigo">{VAT_SHORT[p.vat_category]}</Badge></span>
                  {!p.active && <Badge color="amber">Inaktiv</Badge>}
                  <div className="text-right">
                    <Money ore={p.price_ore} className="text-sm font-medium" />
                    <p className="text-xs text-slate-400">per {p.unit}</p>
                  </div>
                  <button onClick={() => setEditing(p)} aria-label={`Rediger ${p.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <Pencil className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="h-fit lg:sticky lg:top-6">
        <ProductForm key={editing?.id ?? "ny"} product={editing} accounts={revenueAccounts} vatRegistered={vatRegistered} onDone={done} />
      </div>
    </div>
  );
}
