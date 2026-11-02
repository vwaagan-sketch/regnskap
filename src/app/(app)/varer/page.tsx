import { PageHeader } from "@/components/ui";
import { listAccounts } from "@/db/account-repo";
import { requireContext } from "@/db/context";
import { listProducts } from "@/db/product-repo";
import ProductsView from "./products-view";

export default async function VarerPage() {
  const { sql, company } = await requireContext();
  const [products, accounts] = await Promise.all([
    listProducts(sql, company.id),
    listAccounts(sql, company.id, { onlyActive: true }),
  ]);
  return (
    <>
      <PageHeader title="Varer og tjenester" description="Faste varer og tjenester du fakturerer. Velg dem i fakturaskjemaet, så fylles linjen ut." />
      <ProductsView
        products={products}
        revenueAccounts={accounts.filter((a) => a.number.startsWith("3")).map((a) => ({ number: a.number, name: a.name, vat: a.vat_category }))}
        vatRegistered={company.vat_registered}
      />
    </>
  );
}
