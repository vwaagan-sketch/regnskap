import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listAccounts } from "@/db/account-repo";
import ReceiptFlow from "./receipt-flow";

export default async function ReceiptPage() {
  const { sql, company } = await requireContext();
  const accounts = (await listAccounts(sql, company.id, { onlyActive: true }))
    .filter((a) => a.number >= "4000" && a.number < "8000")
    .map((a) => ({ number: a.number, name: a.name }));
  return (
    <>
      <PageHeader
        title="Ny kvittering eller regning"
        description="Ta bilde eller last opp. Vi leser av beløp og MVA, du sjekker og bokfører."
      />
      <ReceiptFlow vatRegistered={company.vat_registered} accounts={accounts} />
    </>
  );
}
