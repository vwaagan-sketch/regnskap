import { NextResponse } from "next/server";
import { apiContext, apiErrorStatus } from "@/db/context";
import { isDocumentLinked, storeDocument } from "@/db/document-repo";
import { insertEntry } from "@/db/ledger-repo";
import { jsonError, readUpload } from "@/lib/http";
import { buildManualEntry, type ManualEntryInput } from "@/lib/manual-entry";

/** Bokfører et manuelt bilag, med nytt vedlegg eller et dokument fra arkivet. */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await apiContext("skriv");
  } catch (e) {
    return jsonError((e as Error).message, apiErrorStatus(e));
  }
  const form = await req.formData();
  let input: ManualEntryInput;
  try {
    input = JSON.parse(String(form.get("data") ?? ""));
  } catch {
    return jsonError("Ugyldige data");
  }
  const up = await readUpload(form, "vedlegg");
  if (!up.ok) return jsonError(up.error, 415);
  const archiveId = String(form.get("dokumentId") ?? "") || null;

  let entry;
  try {
    entry = buildManualEntry(input, ctx.company.vat_registered);
  } catch (e) {
    return jsonError((e as Error).message, 422);
  }
  try {
    const result = await ctx.sql.begin(async (tx) => {
      let documentId: string | null = null;
      if (up.file) {
        documentId = await storeDocument(tx, ctx.company.id, {
          kind: up.file.mediaType.startsWith("image/") ? "image" : "pdf",
          content: up.file.content,
          mediaType: up.file.mediaType,
          filename: up.file.filename,
          title: input.description,
          documentDate: input.date,
        }, ctx.user.email);
      } else if (archiveId) {
        const [doc] = await tx`SELECT id FROM document WHERE id = ${archiveId} AND company_id = ${ctx.company.id}`;
        if (!doc) throw new Error("Fant ikke dokumentet i arkivet");
        if (await isDocumentLinked(tx, archiveId)) throw new Error("Dokumentet er allerede brukt på et annet bilag");
        documentId = archiveId;
      }
      return insertEntry(tx, ctx.company.id, entry, ctx.user.email, documentId);
    });
    return NextResponse.json(result);
  } catch (e) {
    return jsonError((e as Error).message, 422);
  }
}
