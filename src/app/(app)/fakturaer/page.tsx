import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, Money, PageHeader, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listInvoices } from "@/db/invoice-repo";
import { today } from "@/lib/http";
import { STATUS_LABEL, invoiceStatus } from "./status";

export default async function FakturaerPage() {
  const { sql, company } = await requireContext();
  const invoices = await listInvoices(sql, company.id);
  const d = today();
  const open = invoices.filter((i) => i.kind === "invoice").reduce((s, i) => s + Number(i.gross_ore) - Number(i.paid_ore), 0);
  const overdue = invoices
    .filter((i) => invoiceStatus(i.kind, Number(i.gross_ore), Number(i.paid_ore), i.due_date, d) === "forfalt")
    .reduce((s, i) => s + Number(i.gross_ore) - Number(i.paid_ore), 0);

  return (
    <>
      <PageHeader title="Fakturaer" actions={<ButtonLink href="/fakturaer/ny"><Plus className="h-4 w-4" /> Ny faktura</ButtonLink>} />
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card className="p-5"><p className="text-xs font-medium text-slate-500">Utestående</p><Money ore={open} className="mt-1 block text-2xl font-semibold" /></Card>
        <Card className="p-5"><p className="text-xs font-medium text-slate-500">Forfalt</p><Money ore={overdue} className="mt-1 block text-2xl font-semibold text-rose-600" /></Card>
      </div>
      <Card>
        {invoices.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="Ingen fakturaer ennå" text="Lag din første faktura. Den bokføres automatisk."
            action={<ButtonLink href="/fakturaer/ny"><Plus className="h-4 w-4" /> Ny faktura</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {invoices.map((i) => {
              const st = STATUS_LABEL[invoiceStatus(i.kind, Number(i.gross_ore), Number(i.paid_ore), i.due_date, d)];
              return (
                <li key={i.id}>
                  <Link href={`/fakturaer/${i.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                    <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-slate-400">{i.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.customer_name}</span>
                      <span className="text-xs text-slate-500">{formatDate(i.issue_date)} · forfall {formatDate(i.due_date)}</span>
                    </span>
                    <Badge color={st.color}>{st.label}</Badge>
                    <Money ore={i.gross_ore} className="w-28 shrink-0 text-right text-sm font-medium" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
