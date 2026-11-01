import { PageHeader } from "@/components/ui";
import { requireContext } from "@/db/context";
import { listDocuments } from "@/db/document-repo";
import ManualEntryForm from "./manual-form";

export default async function NyttBilagPage({ searchParams }: { searchParams: Promise<{ dokument?: string }> }) {
  const { sql, company } = await requireContext();
  const { dokument } = await searchParams;
  const accounts = await sql<{ number: string; name: string }[]>`
    SELECT number, name FROM account WHERE company_id = ${company.id} ORDER BY number`;
  const docs = await listDocuments(sql, company.id, "ubokfort");
  return (
    <>
      <PageHeader title="Nytt bilag" description="Fri postering på valgfrie konti. Debet og kredit må gå i balanse." />
      <ManualEntryForm
        accounts={accounts}
        vatRegistered={company.vat_registered}
        archive={docs.map((d) => ({ id: d.id, label: d.title || d.filename || "Dokument", date: d.created_at, mediaType: d.media_type }))}
        preselectedDocument={dokument ?? null}
      />
    </>
  );
}
