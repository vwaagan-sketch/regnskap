import { Alert, PageHeader } from "@/components/ui";
import { requireUser } from "@/db/context";
import { createFirma } from "../actions";
import FirmaForm from "../firma-form";

export default async function NyttFirmaPage() {
  const { company } = await requireUser();
  return (
    <>
      <PageHeader
        title="Legg til firma"
        description="Firmaet får eget regnskap, egne kunder og egne brukere. Du blir administrator."
      />
      {!company && (
        <div className="mb-6">
          <Alert>Du har ikke tilgang til noe firma ennå. Registrer firmaet ditt her, eller be en administrator om en invitasjon.</Alert>
        </div>
      )}
      <FirmaForm company={null} action={createFirma} submitLabel="Opprett firma" />
    </>
  );
}
