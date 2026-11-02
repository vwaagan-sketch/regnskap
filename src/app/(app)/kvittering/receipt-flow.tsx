"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { Alert, Button, ButtonLink, Card, Field, cx, inputClass } from "@/components/ui";
import { formatKr, oreToInput, parseKr } from "@/lib/money";
import { MAX_ROUNDING_ORE } from "@/lib/receipt/booking";
import type { ReceiptData } from "@/lib/receipt/scan";

interface VatRow { rate: string; base: string; vat: string }
interface FormState {
  supplierName: string; supplierOrgNo: string; documentNumber: string; date: string;
  description: string; expenseAccount: string; total: string; paid: boolean; vatLines: VatRow[];
}

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
const empty = (): FormState => ({
  supplierName: "", supplierOrgNo: "", documentNumber: "", date: today(), description: "",
  expenseAccount: "6800", total: "", paid: true, vatLines: [{ rate: "25", base: "", vat: "" }],
});

function fromScan(d: ReceiptData, accounts: { number: string }[]): FormState {
  return {
    supplierName: d.supplierName ?? "",
    supplierOrgNo: d.supplierOrgNo ?? "",
    documentNumber: d.documentNumber ?? "",
    date: d.issueDate ?? today(),
    description: d.description ?? "",
    expenseAccount: accounts.some((a) => a.number === d.suggestedAccount) ? d.suggestedAccount : "7790",
    total: oreToInput(d.totalInclVatOre),
    paid: d.documentType !== "invoice",
    vatLines: d.vatLines.map((l) => ({ rate: String(l.ratePercent), base: oreToInput(l.baseOre), vat: oreToInput(l.vatOre) })),
  };
}

export default function ReceiptFlow({ vatRegistered, accounts }: { vatRegistered: boolean; accounts: { number: string; name: string }[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanInfo, setScanInfo] = useState<{ warnings: string[]; notes: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ voucherNo: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  async function onFile(f: File) {
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setError(null);
    setScanInfo(null);
    setDone(null);
    if (!f.type.startsWith("image/")) {
      setForm(empty());
      return;
    }
    setScanning(true);
    const body = new FormData();
    body.append("image", f);
    try {
      const res = await fetch("/api/receipts/scan", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kunne ikke tolke bildet");
      setForm(fromScan(json.data, accounts));
      setScanInfo({ warnings: json.warnings, notes: json.data.notes });
    } catch (e) {
      setError(`${(e as Error).message}. Fyll ut feltene selv.`);
      setForm(empty());
    } finally {
      setScanning(false);
    }
  }

  function reset() {
    setFile(null); setPreview(null); setForm(null); setDone(null); setError(null); setScanInfo(null);
  }

  if (done) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-lg font-semibold">Bokført som bilag {done.voucherNo}</p>
          <p className="text-sm text-slate-500">Originalen er lagret i arkivet.</p>
          <div className="mt-2 flex gap-2">
            <Button onClick={reset}><Camera className="h-4 w-4" /> Ny kvittering</Button>
            <ButtonLink href="/bilag" variant="secondary">Se bilag</ButtonLink>
          </div>
        </div>
      </Card>
    );
  }

  if (!form && !scanning) {
    return (
      <div className="grid gap-4">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
          className={cx(
            "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-white px-6 py-16 text-center transition",
            dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40",
          )}
        >
          <div className="rounded-2xl bg-indigo-50 p-4 text-indigo-600 transition group-hover:scale-105"><Camera className="h-8 w-8" /></div>
          <p className="text-base font-semibold">Ta bilde eller slipp en fil her</p>
          <p className="text-sm text-slate-500">JPG, PNG eller PDF. Bilder tolkes automatisk.</p>
          <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <div className="text-center">
          <button onClick={() => setForm(empty())} className="text-sm font-medium text-indigo-600 hover:underline">
            Eller registrer uten bilde
          </button>
        </div>
      </div>
    );
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setVat = (i: number, k: keyof VatRow, v: string) =>
    setForm((f) => {
      if (!f) return f;
      const vatLines = f.vatLines.map((r, j) => {
        if (j !== i) return r;
        const next = { ...r, [k]: v };
        if (k !== "vat") {
          const base = parseKr(next.base);
          if (base !== null) next.vat = oreToInput(Math.round((base * Number(next.rate)) / 100));
        }
        return next;
      });
      return { ...f, vatLines };
    });

  const totalOre = form ? parseKr(form.total) : null;
  const vatSum = form?.vatLines.reduce((s, l) => s + (parseKr(l.base) ?? 0) + (parseKr(l.vat) ?? 0), 0) ?? 0;
  const mismatch = totalOre !== null && form!.vatLines.length > 0 && Math.abs(vatSum - totalOre) > MAX_ROUNDING_ORE;

  async function submit() {
    if (!form) return;
    setSaving(true);
    setError(null);
    const data = {
      date: form.date,
      supplierName: form.supplierName,
      supplierOrgNo: form.supplierOrgNo.replace(/\D/g, "") || null,
      documentNumber: form.documentNumber || null,
      description: form.description,
      expenseAccount: form.expenseAccount,
      totalOre: parseKr(form.total) ?? 0,
      paid: form.paid,
      vatLines: form.vatLines
        .filter((l) => l.base.trim())
        .map((l) => ({ ratePercent: Number(l.rate), baseOre: parseKr(l.base) ?? NaN, vatOre: parseKr(l.vat) ?? 0 })),
    };
    const body = new FormData();
    body.append("data", JSON.stringify(data));
    if (file) body.append("bilde", file);
    try {
      const res = await fetch("/api/bilag/kvittering", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setDone(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card className="overflow-hidden">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- lokal forhåndsvisning (blob-URL)
          <img src={preview} alt="Kvittering" className="max-h-[70vh] w-full object-contain bg-slate-50" />
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-slate-500">
            <Upload className="h-6 w-6" />
            {file ? file.name : "Ingen fil valgt"}
          </div>
        )}
        <div className="border-t border-slate-100 p-3 text-right">
          <Button variant="ghost" onClick={reset}>Start på nytt</Button>
        </div>
      </Card>

      <Card>
        {scanning ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="font-medium">Leser kvitteringen …</p>
            <p className="text-sm text-slate-500">Finner leverandør, beløp og MVA</p>
          </div>
        ) : form && (
          <div className="grid gap-5 p-5">
            {scanInfo && (
              <Alert kind={scanInfo.warnings.length ? "warning" : "info"}>
                <span className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {scanInfo.warnings.length ? scanInfo.warnings.join(" ") : "Feltene er fylt ut automatisk. Sjekk at alt stemmer."}
                    {scanInfo.notes && <span className="block opacity-80">{scanInfo.notes}</span>}
                  </span>
                </span>
              </Alert>
            )}
            {error && <Alert kind="error">{error}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Leverandør"><input className={inputClass} value={form.supplierName} onChange={(e) => set("supplierName", e.target.value)} /></Field>
              <Field label="Org.nr (valgfritt)"><input className={inputClass} inputMode="numeric" value={form.supplierOrgNo} onChange={(e) => set("supplierOrgNo", e.target.value)} /></Field>
              <Field label="Dato"><input type="date" className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
              <Field label="Fakturanr./kvitteringsnr."><input className={inputClass} value={form.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} /></Field>
              <Field label="Hva ble kjøpt?" className="sm:col-span-2"><input className={inputClass} value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Kostnadskonto" className="sm:col-span-2">
                <select className={inputClass} value={form.expenseAccount} onChange={(e) => set("expenseAccount", e.target.value)}>
                  {accounts.map((a) => <option key={a.number} value={a.number}>{a.number} {a.name}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm font-medium">
              {[{ v: true, l: "Betalt (kort/bank)" }, { v: false, l: "Ubetalt regning" }].map((o) => (
                <button key={String(o.v)} type="button" onClick={() => set("paid", o.v)}
                  className={cx("rounded-lg py-2 transition", form.paid === o.v ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}>
                  {o.l}
                </button>
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">MVA {vatRegistered ? "" : "(firmaet er ikke MVA-registrert, alt føres som kostnad)"}</span>
                <button type="button" onClick={() => set("vatLines", [...form.vatLines, { rate: "15", base: "", vat: "" }])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600"><Plus className="h-3.5 w-3.5" /> Legg til sats</button>
              </div>
              <div className="grid gap-2">
                {form.vatLines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[5.5rem_1fr_1fr_2rem] items-center gap-2">
                    <select className={inputClass} value={l.rate} onChange={(e) => setVat(i, "rate", e.target.value)}>
                      {["25", "15", "12", "0"].map((r) => <option key={r} value={r}>{r} %</option>)}
                    </select>
                    <input className={inputClass} placeholder="Grunnlag" inputMode="decimal" value={l.base} onChange={(e) => setVat(i, "base", e.target.value)} />
                    <input className={inputClass} placeholder="MVA" inputMode="decimal" value={l.vat} onChange={(e) => setVat(i, "vat", e.target.value)} />
                    <button type="button" aria-label="Fjern" onClick={() => set("vatLines", form.vatLines.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <Field label="Totalt inkl. MVA (kr)">
              <input className={cx(inputClass, "text-lg font-semibold")} inputMode="decimal" value={form.total} onChange={(e) => set("total", e.target.value)} />
            </Field>
            {mismatch && <Alert kind="warning">Grunnlag + MVA blir {formatKr(vatSum)} kr, men totalen er {formatKr(totalOre!)} kr.</Alert>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <Link href="/bilag/ny" className="text-sm text-slate-500 hover:underline">Trenger du fri postering? Lag manuelt bilag</Link>
              <Button onClick={submit} disabled={saving || totalOre === null || mismatch}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Bokfør
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
