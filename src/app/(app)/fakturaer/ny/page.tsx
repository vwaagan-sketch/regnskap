import { UserPlus } from "lucide-react";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listCustomers } from "@/db/invoice-repo";
import InvoiceForm from "./invoice-form";

export default async function NyFakturaPage() {
  const { sql, company } = await requireContext();
  const customers = await listCustomers(sql, company.id);
  return (
    <>
      <PageHeader title="Ny faktura" description="Fakturaen får neste ledige nummer og bokføres når du utsteder den." />
      {customers.length === 0 ? (
        <Card><EmptyState icon={<UserPlus className="h-6 w-6" />} title="Legg til en kunde først" action={<ButtonLink href="/kunder">Gå til kunder</ButtonLink>} /></Card>
      ) : (
        <InvoiceForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} vatRegistered={company.vat_registered} />
      )}
    </>
  );
}
