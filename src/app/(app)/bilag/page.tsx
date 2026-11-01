import Link from "next/link";
import { BookOpen, ChevronRight, Paperclip, Plus, Camera } from "lucide-react";
import { ButtonLink, Card, EmptyState, Money, PageHeader, formatDate, inputClass } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listEntries } from "@/db/ledger-repo";
import { accountLabel } from "@/lib/accounts";

export default async function BilagPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { sql, company } = await requireContext();
  const { q = "" } = await searchParams;
  const all = await listEntries(sql, company.id, 500);
  const needle = q.trim().toLowerCase();
  const entries = needle
    ? all.filter((e) => `${e.voucher_no} ${e.description} ${e.document_ref}`.toLowerCase().includes(needle))
    : all;

  return (
    <>
      <PageHeader
        title="Bilag"
        description="Alle bokførte posteringer. Bilag kan ikke endres; feil rettes med et nytt bilag."
        actions={
          <>
            <ButtonLink href="/kvittering" variant="secondary"><Camera className="h-4 w-4" /> Kvittering</ButtonLink>
            <ButtonLink href="/bilag/ny"><Plus className="h-4 w-4" /> Nytt bilag</ButtonLink>
          </>
        }
      />
      <form className="mb-4">
        <input name="q" defaultValue={q} placeholder="Søk i bilag …" className={inputClass} />
      </form>
      <Card>
        {entries.length === 0 ? (
          <EmptyState icon={<BookOpen className="h-6 w-6" />} title={needle ? "Ingen treff" : "Ingen bilag ennå"}
            text="Bokfør en kvittering eller lag et manuelt bilag for å komme i gang."
            action={<ButtonLink href="/bilag/ny"><Plus className="h-4 w-4" /> Nytt bilag</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((e) => {
              const debit = e.lines.reduce((s, l) => s + Math.max(0, Number(l.amount_ore)), 0);
              return (
                <li key={e.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums text-slate-400">#{e.voucher_no}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{e.description}</span>
                        <span className="text-xs text-slate-500">{formatDate(e.entry_date)} · {e.document_ref}</span>
                      </span>
                      {e.document_id && <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />}
                      <Money ore={debit} className="shrink-0 text-sm font-medium" />
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-open:rotate-90" />
                    </summary>
                    <div className="bg-slate-50/60 px-5 pb-4 pt-1">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-500">
                            <th className="py-1.5 font-medium">Konto</th>
                            <th className="py-1.5 font-medium">MVA-kode</th>
                            <th className="py-1.5 text-right font-medium">Debet</th>
                            <th className="py-1.5 text-right font-medium">Kredit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.lines.map((l, i) => {
                            const a = Number(l.amount_ore);
                            return (
                              <tr key={i} className="border-t border-slate-200/70">
                                <td className="py-1.5">{accountLabel(l.account)}</td>
                                <td className="py-1.5 text-slate-500">{l.vat_code ?? ""}</td>
                                <td className="py-1.5 text-right">{a > 0 && <Money ore={a} />}</td>
                                <td className="py-1.5 text-right">{a < 0 && <Money ore={-a} />}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {e.document_id && (
                        <Link href={`/api/dokumenter/${e.document_id}`} target="_blank" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline">
                          <Paperclip className="h-4 w-4" /> Åpne vedlegg
                        </Link>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
