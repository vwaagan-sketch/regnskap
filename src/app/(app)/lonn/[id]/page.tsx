import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, Money, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { getRun } from "@/db/payroll-repo";
import { formatKr } from "@/lib/money";
import { PAY_ITEMS } from "@/lib/payroll";
import RunActions from "./run-actions";

const fmtQty = (q: number) => String(q).replace(".", ",");

export default async function LonnskjoringPage({ params }: { params: Promise<{ id: string }> }) {
  const { sql, company } = await requireContext();
  const { id } = await params;
  const data = await getRun(sql, company.id, Number(id));
  if (!data) notFound();
  const { run, slips } = data;
  const isReversal = run.reverses_run_id !== null;
  const status = isReversal
    ? { label: `Reverserer kjøring ${run.reverses_run_no}`, color: "gray" as const }
    : run.reversed_by
      ? { label: `Reversert (kjøring ${run.reversed_by})`, color: "red" as const }
      : run.paid_date
        ? { label: `Utbetalt ${formatDate(run.paid_date)}`, color: "green" as const }
        : { label: "Godkjent, ikke utbetalt", color: "amber" as const };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid gap-6">
        <div className="no-print flex items-center justify-between">
          <Link href="/lonn" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Lønn</Link>
          <Badge color={status.color}>{status.label}</Badge>
        </div>
        <div className="no-print">
          <h1 className="text-2xl font-semibold tracking-tight">Lønnskjøring {run.run_no}</h1>
          <p className="mt-1 text-sm text-slate-500">{run.description} · utbetalingsdato {formatDate(run.pay_date)} · bilag {run.voucher_no}</p>
        </div>

        {slips.map((s) => {
          const e = s.employee;
          return (
            <article key={s.id} className="payslip break-after-page rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0 sm:p-8">
              <header className="flex flex-col justify-between gap-4 sm:flex-row">
                <div>
                  <p className="text-lg font-semibold">Lønnsslipp</p>
                  <p className="text-sm text-slate-600">{company.name} · Org.nr. {company.org_no}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 text-sm sm:text-right">
                  <dt className="text-slate-500">Utbetalingsdato</dt><dd>{formatDate(run.pay_date)}</dd>
                  <dt className="text-slate-500">Lønnskjøring</dt><dd>{run.run_no}</dd>
                </dl>
              </header>
              <section className="mt-6 text-sm">
                <p className="font-medium">{e.name}</p>
                <p className="text-slate-600">{e.address}, {e.postal_code} {e.city}</p>
                <p className="text-slate-500">Ansattnr. {e.employee_no} · {fmtQty(e.position_pct)} % stilling{e.bank_account ? ` · konto ${e.bank_account}` : ""}</p>
              </section>
              <table className="mt-6 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 font-medium">Lønnsart</th>
                    <th className="pb-2 text-right font-medium">Antall</th>
                    <th className="pb-2 text-right font-medium">Sats</th>
                    <th className="pb-2 text-right font-medium">Beløp</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2">{PAY_ITEMS[l.type].label}{l.description ? ` – ${l.description}` : ""}</td>
                      <td className="py-2 text-right tabular-nums">{fmtQty(l.quantity)}</td>
                      <td className="py-2 text-right tabular-nums">{formatKr(Number(l.rate_ore))}</td>
                      <td className="py-2 text-right"><Money ore={l.amount_ore} /></td>
                    </tr>
                  ))}
                  <tr className="border-b border-slate-100 font-medium">
                    <td className="py-2" colSpan={3}>Bruttolønn</td>
                    <td className="py-2 text-right"><Money ore={s.gross_ore} /></td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2" colSpan={3}>Forskuddstrekk {s.tax_mode === "percent" ? `(${s.tax_percent} %)` : "(tabelltrekk)"}</td>
                    <td className="py-2 text-right"><Money ore={-Number(s.tax_ore)} /></td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4 flex items-baseline justify-between rounded-xl bg-slate-50 px-4 py-3 print:bg-white print:ring-1 print:ring-slate-300">
                <span className="font-semibold">Utbetalt</span>
                <span className="text-lg font-semibold tabular-nums">kr {formatKr(Number(s.net_ore))}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
                <div><dt>Brutto hittil i år</dt><dd className="tabular-nums text-slate-700">{formatKr(Number(s.ytd.gross_ore))}</dd></div>
                <div><dt>Trekk hittil i år</dt><dd className="tabular-nums text-slate-700">{formatKr(Number(s.ytd.tax_ore))}</dd></div>
                <div><dt>Feriepengegrunnlag i år</dt><dd className="tabular-nums text-slate-700">{formatKr(Number(s.ytd.holiday_basis_ore))}</dd></div>
                <div><dt>Opptjente feriepenger i år</dt><dd className="tabular-nums text-slate-700">{formatKr(Number(s.ytd.holiday_pay_ore))}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>

      <aside className="no-print grid h-fit gap-4">
        <Card title="Sum">
          <dl className="grid grid-cols-2 gap-y-1.5 p-4 text-sm">
            <dt className="text-slate-500">Brutto</dt><dd className="text-right"><Money ore={run.gross_ore} /></dd>
            <dt className="text-slate-500">Forskuddstrekk</dt><dd className="text-right"><Money ore={run.tax_ore} /></dd>
            <dt className="text-slate-500">Netto</dt><dd className="text-right font-medium"><Money ore={run.net_ore} /></dd>
            <dt className="text-slate-500">Arb.giveravgift</dt><dd className="text-right"><Money ore={run.aga_ore} /></dd>
            <dt className="text-slate-500">Avsatte feriepenger</dt><dd className="text-right"><Money ore={run.holiday_pay_ore} /></dd>
          </dl>
        </Card>
        <RunActions
          id={run.id}
          payDate={run.pay_date}
          netOre={Number(run.net_ore)}
          taxOre={Number(run.tax_ore)}
          canPay={!isReversal && !run.reversed_by && !run.paid_date && Number(run.net_ore) > 0}
          canReverse={!isReversal && !run.reversed_by && !run.paid_date}
        />
        {run.payout_voucher_no && <p className="px-1 text-xs text-slate-400">Utbetalingen er bokført på bilag {run.payout_voucher_no}.</p>}
        <p className="px-1 text-xs text-slate-400">Godkjente lønnskjøringer lagres uforanderlig.</p>
      </aside>
    </div>
  );
}
