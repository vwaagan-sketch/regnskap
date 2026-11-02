import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { getOrCreateInbox, listInboundEmails } from "@/db/inbox-repo";
import { inboxAddress } from "@/lib/inbound/message";
import { saveFirma } from "./actions";
import FirmaForm from "./firma-form";
import InboxSettings from "./inbox-settings";

export default async function FirmaPage() {
  const { sql, company } = await requireContext("admin");
  const [inbox, emails] = await Promise.all([getOrCreateInbox(sql, company.id), listInboundEmails(sql, company.id)]);
  return (
    <>
      <PageHeader title="Firma" description="Opplysningene brukes på fakturaer og i regnskapet." />
      <FirmaForm company={company} action={saveFirma} />
      <div className="mt-8">
        <InboxSettings address={inboxAddress(process.env.INNBOKS_ADRESSE, inbox.token)} allowedSenders={inbox.allowed_senders} emails={emails} />
      </div>
    </>
  );
}
