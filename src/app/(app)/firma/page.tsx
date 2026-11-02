import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { saveFirma } from "./actions";
import FirmaForm from "./firma-form";

export default async function FirmaPage() {
  const { company } = await requireContext("admin");
  return (
    <>
      <PageHeader title="Firma" description="Opplysningene brukes på fakturaer og i regnskapet." />
      <FirmaForm company={company} action={saveFirma} />
    </>
  );
}
