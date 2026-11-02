import { PageHeader, Alert } from "@/components/ui";
import { getSql } from "@/db/client";
import { getCompany } from "@/db/company-repo";
import { getOrCreateInbox, listInboundEmails } from "@/db/inbox-repo";
import { inboxAddress } from "@/lib/inbound/message";
import FirmaForm from "./firma-form";
import InboxSettings from "./inbox-settings";

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
  const inbox = company ? await getOrCreateInbox(sql, company.id) : null;
  const emails = company ? await listInboundEmails(sql, company.id) : [];
  return (
    <>
      <PageHeader title="Firma" description="Opplysningene brukes på fakturaer og i regnskapet." />
      {!company && (
        <div className="mb-6">
          <Alert>Velkommen! Skriv inn organisasjonsnummeret, så henter vi resten fra Brønnøysundregistrene.</Alert>
        </div>
      )}
      <FirmaForm company={company} />
      {inbox && (
        <div className="mt-8">
          <InboxSettings address={inboxAddress(process.env.INNBOKS_ADRESSE, inbox.token)} allowedSenders={inbox.allowed_senders} emails={emails} />
        </div>
      )}
    </>
  );
}
