"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Check, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Card, Field, Money, cx, inputClass } from "@/components/ui";
import { formatKr, oreToInput, parseKr } from "@/lib/money";
import { PAY_ITEMS, PAY_ITEM_TYPES, isActiveIn, type PayItemType, type PayLineInput } from "@/lib/payroll";
import type { RunInput } from "@/db/payroll-repo";
import { createRunAction, previewRunAction, type PreviewResult } from "../actions";

export interface RunEmployee {
  id: number; name: string; payType: "fast" | "time"; monthlyOre: number | null; hourlyOre: number | null;
  taxPercent: number; startDate: string; endDate: string | null;
}
interface Line { type: PayItemType; description: string; quantity: string; rate: string }
interface Row { include: boolean; lines: Line[]; manualTax: string }

const todayIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
const monthName = (period: string) =>
  new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" }).format(new Date(`${period}-15T12:00:00`));

function defaultRow(e: RunEmployee): Row {
  const line: Line = e.payType === "fast"
    ? { type: "fastloenn", description: "", quantity: "1", rate: e.monthlyOre ? oreToInput(e.monthlyOre) : "" }
    : { type: "timeloenn", description: "", quantity: "", rate: e.hourlyOre ? oreToInput(e.hourlyOre) : "" };
  return { include: true, lines: [line], manualTax: "" };
}

export default function RunForm({ employees }: { employees: RunEmployee[] }) {
  const router = useRouter();
  const [payDate, setPayDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Record<number, Row>>(() => Object.fromEntries(employees.map((e) => [e.id, defaultRow(e)])));
  const [preview, setPreview] = useState<PreviewResult["slips"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const period = payDate.slice(0, 7);
  const visible = useMemo(() => employees.filter((e) => isActiveIn({ start_date: e.startDate, end_date: e.endDate }, period)), [employees, period]);

  const change = (id: number, fn: (r: Row) => Row) => {
    setPreview(null);
    setRows((rs) => ({ ...rs, [id]: fn(rs[id]) }));
  };
  const updateLine = (id: number, i: number, patch: Partial<Line>) =>
    change(id, (r) => ({ ...r, lines: r.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  function buildInput(): RunInput | string {
    const slips: RunInput["slips"] = [];
    for (const e of visible) {
      const r = rows[e.id];
      if (!r.include) continue;
      const lines: PayLineInput[] = [];
      for (const l of r.lines) {
        if (!l.quantity.trim() && !l.rate.trim()) continue;
        const quantity = Number(l.quantity.replace(",", "."));
        const rateOre = parseKr(l.rate);
        if (!Number.isFinite(quantity) || quantity === 0) return `${e.name}: fyll inn antall for ${PAY_ITEMS[l.type].label.toLowerCase()}`;
        if (rateOre === null || rateOre <= 0) return `${e.name}: ugyldig sats for ${PAY_ITEMS[l.type].label.toLowerCase()}`;
        lines.push({ type: l.type, description: l.description.trim() || undefined, quantity, rateOre });
      }
      if (lines.length === 0) continue;
      let manualTaxOre: number | null = null;
      if (r.manualTax.trim()) {
        manualTaxOre = parseKr(r.manualTax);
        if (manualTaxOre === null) return `${e.name}: ugyldig forskuddstrekk`;
      }
      slips.push({ employeeId: e.id, lines, manualTaxOre });
    }
    return { payDate, description, slips };
  }

  function calculate() {
    setError(null);
    const input = buildInput();
    if (typeof input === "string") return setError(input);
    start(async () => {
      const r = await previewRunAction(input);
      if (r.error) setError(r.error);
      else setPreview(r.slips ?? null);
    });
  }

  function approve() {
    const input = buildInput();
    if (typeof input === "string") return setError(input);
    if (!confirm("Godkjenne og bokføre lønnskjøringen? Den kan ikke endres etterpå, bare reverseres.")) return;
    start(async () => {
      const r = await createRunAction(input);
      if (r.error) setError(r.error);
      else router.push(`/lonn/${r.id}`);
    });
  }

  const totals = preview?.reduce(
    (s, p) => ({
      gross: s.gross + p.calc.grossOre,
      tax: s.tax + p.calc.taxOre,
      net: s.net + p.calc.netOre,
      aga: s.aga + p.calc.agaSalaryOre + p.calc.agaHolidayOre,
      holiday: s.holiday + p.calc.holidayPayOre,
    }),
    { gross: 0, tax: 0, net: 0, aga: 0, holiday: 0 },
  );

  return (
    <div className="grid gap-6">
      <Card className="grid items-start gap-4 p-5 sm:grid-cols-[12rem_1fr]">
        <Field label="Utbetalingsdato" hint={`Rapporteres i a-meldingen for ${monthName(period)}`}>
          <input type="date" value={payDate} onChange={(e) => { setPayDate(e.target.value); setPreview(null); }} className={inputClass} />
        </Field>
        <Field label="Beskrivelse">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={`Lønn ${period}`} className={inputClass} />
        </Field>
      </Card>

      {visible.length === 0 && <Alert kind="warning">Ingen ansatte har arbeidsforhold i {monthName(period)}.</Alert>}

      {visible.map((e) => {
        const r = rows[e.id];
        return (
          <Card key={e.id} title={e.name} action={
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={r.include} onChange={(ev) => change(e.id, (x) => ({ ...x, include: ev.target.checked }))} /> Ta med
            </label>
          }>
            <div className={cx("grid gap-3 p-5", !r.include && "opacity-40")}>
              {r.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[12rem_1fr_6rem_8rem_8rem_2.5rem] sm:items-end">
                  <Field label={i === 0 ? "Lønnsart" : ""}>
                    <select value={l.type} onChange={(ev) => updateLine(e.id, i, { type: ev.target.value as PayItemType })} className={inputClass}>
                      {PAY_ITEM_TYPES.map((t) => <option key={t} value={t}>{PAY_ITEMS[t].label}</option>)}
                    </select>
                  </Field>
                  <Field label={i === 0 ? "Tekst" : ""}>
                    <input value={l.description} onChange={(ev) => updateLine(e.id, i, { description: ev.target.value })} placeholder="Valgfritt" className={inputClass} />
                  </Field>
                  <Field label={i === 0 ? "Antall" : ""}>
                    <input value={l.quantity} inputMode="decimal" onChange={(ev) => updateLine(e.id, i, { quantity: ev.target.value })} className={inputClass} />
                  </Field>
                  <Field label={i === 0 ? "Sats (kr)" : ""}>
                    <input value={l.rate} inputMode="decimal" onChange={(ev) => updateLine(e.id, i, { rate: ev.target.value })} className={inputClass} />
                  </Field>
                  <div className="self-center text-right text-sm tabular-nums text-slate-600 sm:pb-2">
                    {formatKr(PAY_ITEMS[l.type].sign * Math.round((Number(l.quantity.replace(",", ".")) || 0) * (parseKr(l.rate) ?? 0)))}
                  </div>
                  <Button type="button" variant="ghost" aria-label="Fjern linje" onClick={() => change(e.id, (x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Button type="button" variant="secondary" onClick={() => change(e.id, (x) => ({ ...x, lines: [...x.lines, { type: "overtid", description: "", quantity: "", rate: "" }] }))}>
                  <Plus className="h-4 w-4" /> Legg til linje
                </Button>
                <Field label="Forskuddstrekk (kr)" hint={`Tomt = ${e.taxPercent} % prosenttrekk. Fyll inn beløp ved tabelltrekk.`} className="w-64">
                  <input value={r.manualTax} inputMode="decimal" onChange={(ev) => change(e.id, (x) => ({ ...x, manualTax: ev.target.value }))} className={inputClass} />
                </Field>
              </div>
            </div>
          </Card>
        );
      })}

      {error && <Alert kind="error">{error}</Alert>}

      {preview && totals && (
        <Card title="Kontroll før godkjenning">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2 font-medium">Ansatt</th>
                  <th className="px-3 py-2 text-right font-medium">Brutto</th>
                  <th className="px-3 py-2 text-right font-medium">Forskuddstrekk</th>
                  <th className="px-3 py-2 text-right font-medium">Netto</th>
                  <th className="px-3 py-2 text-right font-medium">Arb.giveravgift</th>
                  <th className="px-5 py-2 text-right font-medium">Feriepenger</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.employeeId} className="border-b border-slate-50">
                    <td className="px-5 py-2.5">{p.employeeName} <span className="text-xs text-slate-400">{p.tax.mode === "percent" ? `${p.tax.percent} %` : "manuelt trekk"}</span></td>
                    <td className="px-3 py-2.5 text-right"><Money ore={p.calc.grossOre} /></td>
                    <td className="px-3 py-2.5 text-right"><Money ore={p.calc.taxOre} /></td>
                    <td className="px-3 py-2.5 text-right font-medium"><Money ore={p.calc.netOre} /></td>
                    <td className="px-3 py-2.5 text-right"><Money ore={p.calc.agaSalaryOre + p.calc.agaHolidayOre} /></td>
                    <td className="px-5 py-2.5 text-right"><Money ore={p.calc.holidayPayOre} /></td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-5 py-2.5">Sum</td>
                  <td className="px-3 py-2.5 text-right"><Money ore={totals.gross} /></td>
                  <td className="px-3 py-2.5 text-right"><Money ore={totals.tax} /></td>
                  <td className="px-3 py-2.5 text-right"><Money ore={totals.net} /></td>
                  <td className="px-3 py-2.5 text-right"><Money ore={totals.aga} /></td>
                  <td className="px-5 py-2.5 text-right"><Money ore={totals.holiday} /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-xs text-slate-500">
            Feriepengene avsettes nå og utbetales normalt i juni neste år. Arbeidsgiveravgift av feriepengene avsettes samtidig.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={calculate} disabled={pending}><Calculator className="h-4 w-4" /> Beregn</Button>
        <Button type="button" onClick={approve} disabled={pending || !preview}><Check className="h-4 w-4" /> Godkjenn og bokfør</Button>
      </div>
    </div>
  );
}
