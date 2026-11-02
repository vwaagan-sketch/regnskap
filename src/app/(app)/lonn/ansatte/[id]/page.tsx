import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { getEmployee } from "@/db/payroll-repo";
import EmployeeForm from "../employee-form";

export default async function AnsattPage({ params }: { params: Promise<{ id: string }> }) {
  const { sql, company } = await requireContext();
  const { id } = await params;
  const employee = await getEmployee(sql, company.id, Number(id));
  if (!employee) notFound();
  return (
    <>
      <Link href="/lonn/ansatte" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Ansatte</Link>
      <PageHeader title={employee.name} description={`Ansattnr. ${employee.employee_no}. Endringer gjelder fra neste lønnskjøring; godkjente lønnsslipper endres ikke.`} />
      <div className="max-w-xl"><EmployeeForm employee={employee} /></div>
    </>
  );
}
