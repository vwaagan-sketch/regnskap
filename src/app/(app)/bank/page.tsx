import Link from "next/link";
import { CheckCircle2, FileText, Landmark, Paperclip } from "lucide-react";
import { Alert, Badge, Card, EmptyState, Money, PageHeader, cx, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listAccounts } from "@/db/account-repo";
import {
  listBankTransactions, listStatements, reconciliationSuggestions, reconciliationSummary, toBankTx,
} from "@/db/bank-repo";
import { ApproveAllButton, StatementUpload, TransactionRow, UnmatchButton } from "./bank-client";

const KIND_LABEL = { invoice_payment: "Innbetaling faktura", new_entry: "Bokført fra bank", existing_entry: "Koblet til bilag" } as const;

function Row({ label, ore, strong, hint }: { label: string; ore: number | null; strong?: boolean; hint?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-1.5 text-sm", strong && "border-t border-slate-200 pt-2.5 font-semibold")}>
      <span className="text-slate-600">{label}{hint && <span className="block text-xs font-normal text-slate-400">{hint}</span>}</span>
      {ore === null ? <span className="text-slate-400">–</span> : <Money ore={ore} />}
    </div>
  );
}

export default async function BankPage() {
  const { sql, company } = await requireContext();
  const [summary, { open, invoices, entries, suggestions }, matched, statements, accounts] = await Promise.all([
    reconciliationSummary(sql, company.id),
    reconciliationSuggestions(sql, company.id),
    listBankTransactions(sql, company.id, "matched"),
    listStatements(sql, company.id),
    listAccounts(sql, company.id, { onlyActive: true }),
  ]);
  const safe = [...suggestions.values()].filter((s) => s.confidence === "sikker").length;
  const notInBank = entries.filter((e) => summary.startDate !== null && e.date >= summary.startDate);
  const accountOptions = accounts.map((a) => ({ number: a.number, name: a.name }));

  return (
    <>
      <PageHeader
        title="Bank"
        description="Importer kontoutskrift og avstem banktransaksjonene mot fakturaer og bilag."
        actions={open.length > 0 ? <ApproveAllButton count={safe} /> : undefined}
      />

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          <StatementUpload />
          <p className="text-xs text-slate-500">
            Last ned kontoutskriften fra nettbanken som CAMT.053 (ofte kalt «ISO 20022» eller «XML») eller CSV.
            Filen arkiveres som dokumentasjon. Automatisk henting fra banken kommer senere.
          </p>
        </div>
        <Card title="Bankavstemming">
          {summary.date === null ? (
            <p className="p-5 text-sm text-slate-500">Importer en kontoutskrift for å se avstemmingen.</p>
          ) : (
            <div className="p-5">
              <p className="mb-2 text-xs text-slate-500">Per {formatDate(summary.date)} (fra {formatDate(summary.startDate)})</p>
              <Row label="Saldo i banken" ore={summary.bankBalanceOre} hint={summary.bankBalanceOre === null ? "Ikke oppgitt i CSV-filen" : undefined} />
              <Row label="Saldo i regnskapet (1920)" ore={summary.ledgerBalanceOre} />
              <Row label="Differanse" ore={summary.bankBalanceOre === null ? null : summary.bankBalanceOre - summary.ledgerBalanceOre} strong />
              <p className="mt-3 text-xs font-medium text-slate-500">Forklart av</p>
              <Row label={`I banken, ikke bokført (${summary.unmatchedBankCount})`} ore={summary.unmatchedBankOre} />
              <Row label={`Bokført, ikke i banken (${summary.unmatchedLedgerCount})`} ore={summary.unmatchedLedgerOre === 0 ? 0 : -summary.unmatchedLedgerOre} />
              {summary.openingDiffOre !== null && <Row label="Ulik inngående saldo" ore={summary.openingDiffOre} hint="Bank mot regnskap før første utskrift" />}
              <Row label="Uforklart" ore={summary.unexplainedOre} strong />
              {summary.unexplainedOre === 0 && summary.unmatchedBankCount === 0 && summary.unmatchedLedgerCount === 0 && (
                <div className="mt-3"><Alert kind="success">Banken er avstemt.</Alert></div>
              )}
              {summary.unexplainedOre !== null && summary.unexplainedOre !== 0 && (
                <div className="mt-3"><Alert kind="warning">Det er en uforklart differanse. Sjekk at alle kontoutskrifter for perioden er importert og at åpningsbalansen er bokført.</Alert></div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card title={`Til avstemming (${open.length})`} className="mb-6">
        {open.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={statements.length ? "Alt er avstemt" : "Ingen banktransaksjoner ennå"}
            text={statements.length ? "Alle importerte banktransaksjoner er koblet til et bilag." : "Importer en kontoutskrift for å begynne."} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {open.map((t) => {
              const tx = toBankTx(t);
              return (
                <TransactionRow
                  key={t.id}
                  tx={{ id: tx.id, date: tx.date, amountOre: tx.amountOre, description: tx.description, counterparty: t.counterparty, reference: t.reference }}
                  suggestion={suggestions.get(t.id) ?? null}
                  invoices={tx.amountOre > 0 ? invoices : []}
                  entries={entries.filter((e) => Math.sign(e.amountOre) === Math.sign(tx.amountOre))}
                  accounts={accountOptions}
                  vatRegistered={company.vat_registered}
                />
              );
            })}
          </ul>
        )}
      </Card>

      {notInBank.length > 0 && (
        <Card title={`Bokført på bankkonto, ikke funnet i banken (${notInBank.length})`} className="mb-6">
          <p className="px-5 pt-3 text-xs text-slate-500">Kan være betalinger som ikke er gjennomført ennå, eller bilag ført på feil konto eller dato.</p>
          <ul className="divide-y divide-slate-100">
            {notInBank.map((e) => (
              <li key={e.entryId} className="flex items-center gap-4 px-5 py-3">
                <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-400">#{e.voucherNo}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{e.description}</span>
                  <span className="text-xs text-slate-500">{formatDate(e.date)}</span>
                </span>
                <Money ore={e.amountOre} className="shrink-0 text-sm" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={`Avstemt (${matched.length})`}>
          {matched.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Ingen avstemte transaksjoner ennå.</p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
              {matched.slice(0, 200).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-20 shrink-0 text-xs tabular-nums text-slate-500">{formatDate(t.booking_date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.description}</span>
                    <span className="text-xs text-slate-500">
                      {t.match_kind && KIND_LABEL[t.match_kind]} · <Link href={`/bilag?q=${t.voucher_no}`} className="text-indigo-600 hover:underline">bilag {t.voucher_no}</Link>
                    </span>
                  </span>
                  <Money ore={t.amount_ore} className="shrink-0 text-sm" />
                  {t.match_kind === "existing_entry" ? <UnmatchButton transactionId={t.id} /> : <span className="w-7" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Importerte kontoutskrifter">
          {statements.length === 0 ? (
            <EmptyState icon={<Landmark className="h-6 w-6" />} title="Ingen kontoutskrifter" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {statements.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.filename ?? "Kontoutskrift"}</span>
                    <span className="text-xs text-slate-500">
                      {formatDate(s.from_date)}–{formatDate(s.to_date)} · {s.count} transaksjoner
                      {s.closing_ore !== null && <> · saldo <Money ore={s.closing_ore} /></>}
                    </span>
                  </span>
                  <Badge>{s.format === "camt053" ? "CAMT" : "CSV"}</Badge>
                  <Link href={`/api/dokumenter/${s.document_id}`} target="_blank" title="Åpne original" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    <Paperclip className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
