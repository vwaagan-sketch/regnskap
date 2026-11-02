import Link from "next/link";
import { ArrowLeft, UserRound } from "lucide-react";
import { Badge, Card, EmptyState, Money, PageHeader, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listEmployees } from "@/db/payroll-repo";
import { isActiveIn } from "@/lib/payroll";
import { today } from "@/lib/http";
import EmployeeForm from "./employee-form";

export default async function AnsattePage() {
  const { sql, company } = await requireContext();
  const employees = await listEmployees(sql, company.id);
  const period = today().slice(0, 7);
  return (
    <>
      <Link href="/lonn" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Lønn</Link>
      <PageHeader title="Ansatte" description="Arbeidsforhold, lønn og skattekort. Opplysningene brukes i lønnskjøringen og a-meldingen." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={`${employees.length} ansatte`}>
          {employees.length === 0 ? (
            <EmptyState icon={<UserRound className="h-6 w-6" />} title="Ingen ansatte ennå" text="Legg til den første ansatte i skjemaet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {employees.map((e) => (
                <li key={e.id}>
                  <Link href={`/lonn/ansatte/${e.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
                      {e.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      <p className="truncate text-xs text-slate-500">
                        Ansattnr. {e.employee_no} · {String(e.position_pct).replace(".", ",")} % · fra {formatDate(e.start_date)}
                        {e.end_date ? ` til ${formatDate(e.end_date)}` : ""} · trekk {e.tax_percent} %
                      </p>
                    </div>
                    {!isActiveIn(e, period) && <Badge>Sluttet</Badge>}
                    <div className="text-right">
                      <Money ore={(e.pay_type === "fast" ? e.monthly_salary_ore : e.hourly_rate_ore) ?? 0} className="text-sm font-medium" />
                      <p className="text-xs text-slate-400">{e.pay_type === "fast" ? "per måned" : "per time"}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <EmployeeForm />
      </div>
    </>
  );
}
