"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Alert, Button, Card, Field, cx, inputClass } from "@/components/ui";
import { formatKr, oreToInput, parseKr } from "@/lib/money";
import { vatOf, type VatCategory } from "@/lib/vat";
import { createInvoiceAction } from "../actions";

interface Line { productId: string; description: string; quantity: string; price: string; vat: VatCategory; account?: string; unit?: string }
export interface ProductOption { id: number; name: string; description: string | null; unit: string; priceOre: number; vat: VatCategory; account: string }
const blank = (): Line => ({ productId: "", description: "", quantity: "1", price: "", vat: "high" });
const iso = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(d);
const VAT_LABEL: Record<VatCategory, string> = { high: "25 %", medium: "15 %", low: "12 %", zero: "0 % (fritatt)", exempt: "Unntatt" };

export default function InvoiceForm({ customers, vatRegistered, products }: { customers: { id: number; name: string }[]; vatRegistered: boolean; products: ProductOption[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(String(customers[0]?.id ?? ""));
  const [issueDate, setIssueDate] = useState(iso(new Date()));
  const [dueDays, setDueDays] = useState("14");
  const [deliveryDate, setDeliveryDate] = useState(iso(new Date()));
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dueDate = useMemo(() => {
    const d = new Date(`${issueDate}T12:00:00`);
    d.setDate(d.getDate() + Number(dueDays || 0));
    return iso(d);
  }, [issueDate, dueDays]);

  const totals = useMemo(() => {
    const byCat = new Map<VatCategory, number>();
    for (const l of lines) {
      const price = parseKr(l.price) ?? 0;
      const qty = Number(l.quantity.replace(",", ".")) || 0;
      const cat = vatRegistered ? l.vat : "exempt";
      byCat.set(cat, (byCat.get(cat) ?? 0) + Math.round(price * qty));
    }
    let net = 0, vat = 0;
    byCat.forEach((base, cat) => { net += base; vat += vatOf(base, cat); });
    return { net, vat, gross: net + vat };
  }, [lines, vatRegistered]);

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickProduct = (i: number, id: string) => {
    const p = products.find((x) => String(x.id) === id);
    if (!p) return update(i, { productId: "", account: undefined, unit: undefined });
    update(i, {
      productId: id,
      description: p.description ? `${p.name} – ${p.description}` : p.name,
      price: oreToInput(p.priceOre),
      vat: p.vat,
      account: p.account,
      unit: p.unit,
    });
  };

  function submit() {
    setError(null);
    start(async () => {
      const r = await createInvoiceAction({
        customerId: Number(customerId),
        issueDate, dueDate, deliveryDate,
        lines: lines.filter((l) => l.description || l.price).map((l) => ({
          description: l.description,
          quantity: Number(l.quantity.replace(",", ".")),
          unitPriceOre: parseKr(l.price) ?? NaN,
          vatCategory: vatRegistered ? l.vat : "exempt",
          account: l.account,
          unit: l.unit,
        })),
      });
      if (r.error) setError(r.error);
      else router.push(`/fakturaer/${r.id}`);
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-4">
          <Field label="Kunde" className="sm:col-span-4">
            <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Fakturadato"><input type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></Field>
          <Field label="Betalingsfrist">
            <select className={inputClass} value={dueDays} onChange={(e) => setDueDays(e.target.value)}>
              {["7", "10", "14", "20", "30", "45"].map((d) => <option key={d} value={d}>{d} dager</option>)}
            </select>
          </Field>
          <Field label="Forfallsdato"><input className={cx(inputClass, "bg-slate-50")} value={dueDate.split("-").reverse().join(".")} readOnly /></Field>
          <Field label="Leveringsdato"><input type="date" className={inputClass} value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Linjer" action={<button type="button" onClick={() => setLines([...lines, blank()])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600"><Plus className="h-4 w-4" /> Linje</button>}>
        <div className="grid gap-3 p-5">
          <div className="hidden grid-cols-[10rem_minmax(0,3fr)_5rem_8rem_7rem_7rem_2rem] gap-2 text-xs font-medium text-slate-500 md:grid">
            <span>Vare</span><span>Beskrivelse</span><span className="text-right">Antall</span><span className="text-right">Pris eks. MVA</span><span>MVA</span><span className="text-right">Sum</span><span />
          </div>
          {lines.map((l, i) => {
            const sum = Math.round((parseKr(l.price) ?? 0) * (Number(l.quantity.replace(",", ".")) || 0));
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 md:grid-cols-[10rem_minmax(0,3fr)_5rem_8rem_7rem_7rem_2rem] md:bg-transparent md:p-0">
                <select className={cx(inputClass, "col-span-2 md:col-span-1")} value={l.productId} onChange={(e) => pickProduct(i, e.target.value)} aria-label="Velg vare">
                  <option value="">{products.length ? "Fritekst" : "Ingen varer"}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input className={cx(inputClass, "col-span-2 md:col-span-1")} placeholder="Hva leveres?" value={l.description} onChange={(e) => update(i, { description: e.target.value })} />
                <div className="relative">
                  <input className={cx(inputClass, "text-right", l.unit && "pr-10")} inputMode="decimal" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} aria-label="Antall" />
                  {l.unit && <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">{l.unit}</span>}
                </div>
                <input className={cx(inputClass, "text-right")} inputMode="decimal" placeholder="0,00" value={l.price} onChange={(e) => update(i, { price: e.target.value })} />
                <select className={inputClass} disabled={!vatRegistered} value={l.vat} onChange={(e) => update(i, { vat: e.target.value as VatCategory })}>
                  {(Object.keys(VAT_LABEL) as VatCategory[]).map((c) => <option key={c} value={c}>{VAT_LABEL[c]}</option>)}
                </select>
                <span className="self-center text-right text-sm tabular-nums">{formatKr(sum)}</span>
                <button type="button" aria-label="Fjern linje" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="grid place-items-center text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
          <dl className="ml-auto mt-3 grid w-full max-w-xs grid-cols-2 gap-y-1 border-t border-slate-100 pt-3 text-sm">
            <dt className="text-slate-500">Netto</dt><dd className="text-right tabular-nums">{formatKr(totals.net)}</dd>
            <dt className="text-slate-500">MVA</dt><dd className="text-right tabular-nums">{formatKr(totals.vat)}</dd>
            <dt className="font-semibold">Å betale</dt><dd className="text-right text-lg font-semibold tabular-nums">{formatKr(totals.gross)}</dd>
          </dl>
        </div>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex items-center justify-end gap-3">
        <p className="text-xs text-slate-500">En utstedt faktura kan ikke endres, bare krediteres.</p>
        <Button onClick={submit} disabled={pending || totals.gross <= 0}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Utsted faktura
        </Button>
      </div>
    </div>
  );
}
