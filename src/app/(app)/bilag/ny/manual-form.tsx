"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Paperclip, Plus, Trash2 } from "lucide-react";
import { Alert, Button, ButtonLink, Card, Field, cx, inputClass } from "@/components/ui";
import { formatKr, parseKr } from "@/lib/money";
import { vatSide } from "@/lib/manual-entry";

interface Line { account: string; debit: string; credit: string; vat: "" | "high" | "medium" | "low"; description: string }
const blank = (): Line => ({ account: "", debit: "", credit: "", vat: "", description: "" });
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());

export default function ManualEntryForm({
  accounts, vatRegistered, archive, preselectedDocument,
}: {
  accounts: { number: string; name: string }[];
  vatRegistered: boolean;
  archive: { id: string; label: string; date: string; mediaType: string }[];
  preselectedDocument: string | null;
}) {
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [attachMode, setAttachMode] = useState<"ingen" | "fil" | "arkiv">(preselectedDocument ? "arkiv" : "ingen");
  const [file, setFile] = useState<File | null>(null);
  const [docId, setDocId] = useState(preselectedDocument ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + (parseKr(l.debit) ?? 0), 0);
    const c = lines.reduce((s, l) => s + (parseKr(l.credit) ?? 0), 0);
    return { d, c, diff: d - c };
  }, [lines]);

  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit() {
    setSaving(true);
    setError(null);
    const data = {
      date, description, documentRef: reference,
      lines: lines.filter((l) => l.account || l.debit || l.credit).map((l) => ({
        account: l.account,
        debitOre: parseKr(l.debit || "0") ?? NaN,
        creditOre: parseKr(l.credit || "0") ?? NaN,
        vatCategory: l.vat || null,
        description: l.description || undefined,
      })),
    };
    const body = new FormData();
    body.append("data", JSON.stringify(data));
    if (attachMode === "fil" && file) body.append("vedlegg", file);
    if (attachMode === "arkiv" && docId) body.append("dokumentId", docId);
    try {
      const res = await fetch("/api/bilag/manuelt", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDone(json.voucherNo);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (done !== null) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-lg font-semibold">Bokført som bilag {done}</p>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => { setDone(null); setLines([blank(), blank()]); setDescription(""); setReference(""); setFile(null); setDocId(""); setAttachMode("ingen"); }}>
              <Plus className="h-4 w-4" /> Nytt bilag
            </Button>
            <ButtonLink href="/bilag" variant="secondary">Se alle bilag</ButtonLink>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <div className="grid gap-4 p-5 sm:grid-cols-4">
          <Field label="Dato"><input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Beskrivelse" className="sm:col-span-2"><input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="F.eks. innskudd aksjekapital" /></Field>
          <Field label="Referanse (valgfritt)"><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Posteringer" action={
        <button type="button" onClick={() => setLines([...lines, blank()])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600"><Plus className="h-4 w-4" /> Linje</button>
      }>
        <div className="grid gap-3 p-5">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_2rem] gap-2 text-xs font-medium text-slate-500 md:grid">
            <span>Konto</span><span className="text-right">Debet</span><span className="text-right">Kredit</span><span>MVA</span><span />
          </div>
          {lines.map((l, i) => {
            const vatOk = vatRegistered && vatSide(l.account) !== null;
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_2rem] md:bg-transparent md:p-0">
                <select className={cx(inputClass, "col-span-2 md:col-span-1")} value={l.account} onChange={(e) => update(i, { account: e.target.value, vat: vatSide(e.target.value) ? l.vat : "" })}>
                  <option value="">Velg konto …</option>
                  {accounts.map((a) => <option key={a.number} value={a.number}>{a.number} {a.name}</option>)}
                </select>
                <input className={cx(inputClass, "text-right")} placeholder="Debet" inputMode="decimal" value={l.debit} onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                <input className={cx(inputClass, "text-right")} placeholder="Kredit" inputMode="decimal" value={l.credit} onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                <select className={inputClass} disabled={!vatOk} value={l.vat} onChange={(e) => update(i, { vat: e.target.value as Line["vat"] })} title="Beløpet er inkl. MVA; MVA-linjen lages automatisk">
                  <option value="">Ingen MVA</option>
                  <option value="high">25 %</option>
                  <option value="medium">15 %</option>
                  <option value="low">12 %</option>
                </select>
                <button type="button" aria-label="Fjern linje" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="grid place-items-center text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
          <div className="mt-2 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-500">Debet <span className="font-medium text-slate-900 tabular-nums">{formatKr(totals.d)}</span></span>
            <span className="text-slate-500">Kredit <span className="font-medium text-slate-900 tabular-nums">{formatKr(totals.c)}</span></span>
            <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", totals.diff === 0 && totals.d > 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
              {totals.diff === 0 && totals.d > 0 ? "I balanse" : `Differanse ${formatKr(Math.abs(totals.diff))}`}
            </span>
          </div>
          <p className="text-xs text-slate-400">Med MVA-sats er beløpet inkl. MVA. Systemet deler det i netto og MVA og fører MVA på riktig konto.</p>
        </div>
      </Card>

      <Card title="Vedlegg">
        <div className="grid gap-4 p-5">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {([["ingen", "Uten vedlegg"], ["fil", "Last opp fil"], ["arkiv", "Fra arkivet"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setAttachMode(v)} className={cx("rounded-lg py-2 transition", attachMode === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}>{l}</button>
            ))}
          </div>
          {attachMode === "fil" && (
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700" />
          )}
          {attachMode === "arkiv" && (
            archive.length === 0 ? <p className="text-sm text-slate-500">Ingen ubokførte dokumenter i arkivet.</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {archive.map((d) => (
                  <button key={d.id} type="button" onClick={() => setDocId(d.id)}
                    className={cx("flex items-center gap-3 rounded-xl p-3 text-left text-sm ring-1 ring-inset transition", docId === d.id ? "bg-indigo-50 ring-indigo-300" : "ring-slate-200 hover:bg-slate-50")}>
                    <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0"><span className="block truncate font-medium">{d.label}</span><span className="text-xs text-slate-500">{d.date}</span></span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving || totals.diff !== 0 || totals.d === 0}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Bokfør bilag
        </Button>
      </div>
    </div>
  );
}
