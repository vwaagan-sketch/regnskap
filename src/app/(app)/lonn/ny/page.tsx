import Link from "next/link";
import { ArrowLeft, Settings, UserRound } from "lucide-react";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { getPayrollSettings, listEmployees } from "@/db/payroll-repo";
import RunForm from "./run-form";

export default async function NyLonnskjoringPage() {
  const { sql, company } = await requireContext();
  const [settings, employees] = await Promise.all([getPayrollSettings(sql, company.id), listEmployees(sql, company.id)]);
  return (
    <>
      <Link href="/lonn" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Lønn</Link>
      <PageHeader title="Ny lønnskjøring" description="Fyll inn lønnen, beregn og kontroller, og godkjenn. Godkjent lønn bokføres og kan ikke endres." />
      {!settings ? (
        <Card><EmptyState icon={<Settings className="h-6 w-6" />} title="Lønnsinnstillinger mangler" text="Legg inn virksomhetsnummer, sone for arbeidsgiveravgift og feriepengesats først." action={<ButtonLink href="/lonn/innstillinger">Til innstillinger</ButtonLink>} /></Card>
      ) : employees.length === 0 ? (
        <Card><EmptyState icon={<UserRound className="h-6 w-6" />} title="Ingen ansatte" text="Legg inn de ansatte før du kjører lønn." action={<ButtonLink href="/lonn/ansatte">Legg til ansatte</ButtonLink>} /></Card>
      ) : (
        <RunForm employees={employees.map((e) => ({
          id: e.id, name: e.name, payType: e.pay_type, monthlyOre: e.monthly_salary_ore, hourlyOre: e.hourly_rate_ore,
          taxPercent: e.tax_percent, startDate: e.start_date, endDate: e.end_date,
        }))} />
      )}
    </>
  );
}
