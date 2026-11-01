"use client";

import { Fragment, useState } from "react";
import { ACCOUNT_NAMES } from "@/lib/accounts";
import { formatKr } from "@/lib/money";
import type { ReceiptData } from "@/lib/receipt/scan";

export default function ReceiptPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: ReceiptData; warnings: string[] } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function onFile(file: File) {
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("image", file);
    try {
      const res = await fetch("/api/receipts/scan", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Noe gikk galt");
      setResult(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const d = result?.data;
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Ny regning eller kvittering</h1>
      <label className="mt-6 block cursor-pointer rounded-lg border-2 border-dashed p-8 text-center hover:bg-gray-50">
        <span className="font-medium">Ta bilde eller velg fil</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </label>
      {/* eslint-disable-next-line @next/next/no-img-element -- lokal forhåndsvisning (blob-URL) */}
      {preview && <img src={preview} alt="Bilde av dokumentet" className="mt-4 max-h-80 rounded" />}
      {busy && <p className="mt-4">Tolker bildet …</p>}
      {error && <p className="mt-4 text-red-700">{error}</p>}
      {d && (
        <section className="mt-6 space-y-2">
          {result.warnings.map((w) => (
            <p key={w} className="rounded bg-amber-50 p-2 text-amber-900">{w}</p>
          ))}
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1">
            <dt>Leverandør</dt><dd>{d.supplierName} {d.supplierOrgNo && `(org.nr ${d.supplierOrgNo})`}</dd>
            <dt>Dato</dt><dd>{d.issueDate ?? "ukjent"}</dd>
            <dt>Forfall</dt><dd>{d.dueDate ?? "–"}</dd>
            <dt>Totalt</dt><dd>{formatKr(d.totalInclVatOre)} {d.currency}</dd>
            {d.vatLines.map((l) => (
              <Fragment key={l.ratePercent}><dt>MVA {l.ratePercent} %</dt><dd>{formatKr(l.vatOre)} av {formatKr(l.baseOre)}</dd></Fragment>
            ))}
            <dt>KID</dt><dd>{d.kid ?? "–"}</dd>
            <dt>Foreslått konto</dt><dd>{d.suggestedAccount} {ACCOUNT_NAMES[d.suggestedAccount]}</dd>
            <dt>Beskrivelse</dt><dd>{d.description}</dd>
          </dl>
          {d.notes && <p className="text-sm text-gray-600">{d.notes}</p>}
          <p className="text-sm text-gray-500">Godkjenning og bokføring av bilaget kommer i neste steg.</p>
        </section>
      )}
    </main>
  );
}
