import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import ReceiptFlow from "./receipt-flow";

export default async function ReceiptPage() {
  const { company } = await requireContext();
  return (
    <>
      <PageHeader
        title="Ny kvittering eller regning"
        description="Ta bilde eller last opp. Vi leser av beløp og MVA, du sjekker og bokfører."
      />
      <ReceiptFlow vatRegistered={company.vat_registered} />
    </>
  );
}
