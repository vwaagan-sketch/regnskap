import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, Money, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { getInvoice, getPayments } from "@/db/invoice-repo";
import { sellerIdLine } from "@/lib/invoice";
import { formatKr } from "@/lib/money";
import { today } from "@/lib/http";
import { VAT_RATES, type VatCategory } from "@/lib/vat";
import { STATUS_LABEL, invoiceStatus } from "../status";
import InvoiceActions from "./invoice-actions";

function formatAccount(a: string) {
  return a.replace(/^(\d{4})(\d{2})(\d{5})$/, "$1.$2.$3");
}

export default async function FakturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { sql, company } = await requireContext();
  const { id } = await params;
  const inv = await getInvoice(sql, company.id, Number(id));
  if (!inv) notFound();
  const payments = await getPayments(sql, company.id, inv.id);
  const { invoice: f, totals } = inv.snapshot;
  const isCredit = inv.kind === "credit_note";
  const gross = totals.grossOre;
  const paid = Number(inv.paid_ore);
  const statusKey = inv.credited_by ? "kreditert" : invoiceStatus(inv.kind, gross, paid, f.dueDate, today());
  const st = STATUS_LABEL[statusKey];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <div className="no-print mb-4 flex items-center justify-between">
          <Link href="/fakturaer" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Fakturaer</Link>
          <Badge color={st.color}>{st.label}</Badge>
        </div>

        <article className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0 sm:p-12">
          <header className="flex flex-col justify-between gap-6 sm:flex-row">
            <div>
              <p className="text-xl font-semibold">{f.seller.name}</p>
              <p className="text-sm text-slate-600">{f.seller.address}<br />{f.seller.postalCode} {f.seller.city}</p>
              <p className="mt-1 text-sm text-slate-600">{sellerIdLine(f.seller)}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-3xl font-semibold tracking-tight">{isCredit ? "Kreditnota" : "Faktura"}</p>
              <p className="text-sm text-slate-500">Nr. {f.number}</p>
            </div>
          </header>

          <section className="mt-10 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Til</p>
              <p className="mt-1 font-medium">{f.buyer.name}</p>
              <p className="text-sm text-slate-600">{f.buyer.address}<br />{f.buyer.postalCode} {f.buyer.city}</p>
              {f.buyer.orgNo && <p className="text-sm text-slate-600">Org.nr. {f.buyer.orgNo}</p>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:justify-self-end">
              <dt className="text-slate-500">{isCredit ? "Dato" : "Fakturadato"}</dt><dd className="text-right">{formatDate(f.issueDate)}</dd>
              <dt className="text-slate-500">Leveringsdato</dt><dd className="text-right">{formatDate(f.deliveryDate)}</dd>
              {!isCredit && <><dt className="text-slate-500">Forfallsdato</dt><dd className="text-right font-medium">{formatDate(f.dueDate)}</dd></>}
              <dt className="text-slate-500">Kundenr.</dt><dd className="text-right">{inv.snapshot.customerNo}</dd>
              {isCredit && f.creditsInvoiceNumber && <><dt className="text-slate-500">Krediterer faktura</dt><dd className="text-right">{f.creditsInvoiceNumber}</dd></>}
            </dl>
          </section>

          <table className="mt-10 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Beskrivelse</th>
                <th className="pb-2 text-right font-medium">Antall</th>
                <th className="pb-2 text-right font-medium">Pris</th>
                <th className="pb-2 text-right font-medium">MVA</th>
                <th className="pb-2 text-right font-medium">Beløp</th>
              </tr>
            </thead>
            <tbody>
              {totals.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2.5">{l.description}</td>
                  <td className="py-2.5 text-right tabular-nums">{String(l.quantity).replace(".", ",")}{l.unit ? ` ${l.unit}` : ""}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatKr(l.unitPriceOre)}</td>
                  <td className="py-2.5 text-right">{VAT_RATES[l.vatCategory]} %</td>
                  <td className="py-2.5 text-right tabular-nums">{formatKr(l.netOre)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="ml-auto mt-6 grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">Sum eks. MVA</dt><dd className="text-right tabular-nums">{formatKr(totals.netOre)}</dd>
            {(Object.entries(totals.vatByCategory) as [VatCategory, { baseOre: number; vatOre: number }][]).filter(([, b]) => b.vatOre !== 0).map(([cat, b]) => (
              <div key={cat} className="contents">
                <dt className="text-slate-500">MVA {VAT_RATES[cat]} % av {formatKr(b.baseOre)}</dt><dd className="text-right tabular-nums">{formatKr(b.vatOre)}</dd>
              </div>
            ))}
            <dt className="border-t border-slate-200 pt-2 font-semibold">{isCredit ? "Kreditert beløp" : "Å betale"}</dt>
            <dd className="border-t border-slate-200 pt-2 text-right text-lg font-semibold tabular-nums">kr {formatKr(gross)}</dd>
          </dl>

          {!isCredit && (
            <section className="mt-10 grid gap-4 rounded-xl bg-slate-50 p-5 text-sm sm:grid-cols-3 print:bg-white print:ring-1 print:ring-slate-300">
              <div><p className="text-xs text-slate-500">Kontonummer</p><p className="font-medium tabular-nums">{formatAccount(f.seller.bankAccount)}</p></div>
              <div><p className="text-xs text-slate-500">KID</p><p className="font-medium tabular-nums">{f.kid}</p></div>
              <div><p className="text-xs text-slate-500">Beløp innen {formatDate(f.dueDate)}</p><p className="font-medium tabular-nums">kr {formatKr(gross)}</p></div>
            </section>
          )}
        </article>
      </div>

      <aside className="no-print grid h-fit gap-4">
        <InvoiceActions id={inv.id} isCredit={isCredit} canCredit={!isCredit && !inv.credited_by && paid === 0} openOre={isCredit ? 0 : gross - paid} />
        {inv.credited_by && <Card className="p-4 text-sm text-slate-600">Kreditert med kreditnota {inv.credited_by}.</Card>}
        {payments.length > 0 && (
          <Card title="Innbetalinger">
            <ul className="divide-y divide-slate-100 text-sm">
              {payments.map((p, i) => (
                <li key={i} className="flex justify-between px-4 py-2.5">
                  <span>{formatDate(p.paid_date)} <span className="text-xs text-slate-400">bilag {p.voucher_no}</span></span>
                  <Money ore={p.amount_ore} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="px-1 text-xs text-slate-400">Utstedt {inv.issued_at}. Fakturaen er lagret uforanderlig.</p>
      </aside>
    </div>
  );
}
