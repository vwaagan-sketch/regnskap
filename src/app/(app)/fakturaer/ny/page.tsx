import { UserPlus } from "lucide-react";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listCustomers } from "@/db/invoice-repo";
import { listProducts } from "@/db/product-repo";
import InvoiceForm from "./invoice-form";

export default async function NyFakturaPage() {
  const { sql, company } = await requireContext("skriv");
  const [customers, products] = await Promise.all([listCustomers(sql, company.id), listProducts(sql, company.id, { onlyActive: true })]);
  return (
    <>
      <PageHeader title="Ny faktura" description="Fakturaen får neste ledige nummer og bokføres når du utsteder den." />
      {customers.length === 0 ? (
        <Card><EmptyState icon={<UserPlus className="h-6 w-6" />} title="Legg til en kunde først" action={<ButtonLink href="/kunder">Gå til kunder</ButtonLink>} /></Card>
      ) : (
        <InvoiceForm
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          vatRegistered={company.vat_registered}
          products={products.map((p) => ({ id: p.id, name: p.name, description: p.description, unit: p.unit, priceOre: Number(p.price_ore), vat: p.vat_category, account: p.revenue_account }))}
        />
      )}
    </>
  );
}
