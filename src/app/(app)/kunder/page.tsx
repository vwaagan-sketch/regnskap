import { Users, Mail } from "lucide-react";
import { Card, EmptyState, Money, PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listCustomers } from "@/db/invoice-repo";
import CustomerForm from "./customer-form";

export default async function KunderPage() {
  const { sql, company } = await requireContext();
  const customers = await listCustomers(sql, company.id);
  return (
    <>
      <PageHeader title="Kunder" description="Kunderegister og hva hver kunde skylder." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={`${customers.length} kunder`}>
          {customers.length === 0 ? (
            <EmptyState icon={<Users className="h-6 w-6" />} title="Ingen kunder ennå" text="Legg til den første kunden i skjemaet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {customers.map((c) => (
                <li key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      Kundenr. {c.customer_no}{c.org_no ? ` · Org.nr ${c.org_no}` : ""} · {c.postal_code} {c.city}
                    </p>
                  </div>
                  {c.email && <a href={`mailto:${c.email}`} className="hidden text-slate-400 hover:text-indigo-600 sm:block" aria-label="E-post"><Mail className="h-4 w-4" /></a>}
                  <div className="text-right">
                    <Money ore={c.open_ore} className="text-sm font-medium" />
                    <p className="text-xs text-slate-400">utestående</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <CustomerForm />
      </div>
    </>
  );
}
