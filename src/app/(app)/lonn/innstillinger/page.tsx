import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { getPayrollSettings } from "@/db/payroll-repo";
import SettingsForm from "./settings-form";

export default async function LonnInnstillingerPage() {
  const { sql, company } = await requireContext("skriv");
  const settings = await getPayrollSettings(sql, company.id);
  return (
    <>
      <Link href="/lonn" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Lønn</Link>
      <PageHeader title="Lønnsinnstillinger" description="Brukes i lønnsberegningen og i a-meldingen." />
      <SettingsForm settings={settings} />
    </>
  );
}
