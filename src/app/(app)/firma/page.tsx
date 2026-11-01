import { PageHeader, Alert } from "@/components/ui";
import { getSql } from "@/db/client";
import { getCompany } from "@/db/company-repo";
import FirmaForm from "./firma-form";

export default async function FirmaPage() {
  const sql = getSql();
  if (!sql) {
    return (
      <>
        <PageHeader title="Firma" />
        <Alert kind="warning">
          Databasen er ikke koblet til ennå. Legg inn <code>DATABASE_URL</code> under Environment i Render, så kan du registrere firmaet her.
        </Alert>
      </>
    );
  }
  const company = await getCompany(sql);
  return (
    <>
      <PageHeader title="Firma" description="Opplysningene brukes på fakturaer og i regnskapet." />
      {!company && (
        <div className="mb-6">
          <Alert>Velkommen! Skriv inn organisasjonsnummeret, så henter vi resten fra Brønnøysundregistrene.</Alert>
        </div>
      )}
      <FirmaForm company={company} />
    </>
  );
}
