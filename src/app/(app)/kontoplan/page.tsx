import { PageHeader } from "@/components/ui";
import { listAccounts } from "@/db/account-repo";
import { requireContext } from "@/db/context";
import AccountsView from "./accounts-view";

export default async function KontoplanPage() {
  const { sql, company } = await requireContext();
  const accounts = await listAccounts(sql, company.id);
  return (
    <>
      <PageHeader title="Kontoplan" description="Basert på NS 4102. Legg til egne kontoer, gi dem nye navn eller skjul kontoer du ikke bruker." />
      <AccountsView accounts={accounts} />
    </>
  );
}
