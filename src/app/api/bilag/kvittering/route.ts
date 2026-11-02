import { NextResponse } from "next/server";
import { apiContext, apiErrorStatus } from "@/db/context";
import { storeDocument } from "@/db/document-repo";
import { insertEntry } from "@/db/ledger-repo";
import { jsonError, readUpload } from "@/lib/http";
import { buildReceiptEntry, type ReceiptBooking } from "@/lib/receipt/booking";

/** Bokfører en kvittering/regning og lagrer originalen i arkivet i samme transaksjon. */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await apiContext("skriv");
  } catch (e) {
    return jsonError((e as Error).message, apiErrorStatus(e));
  }
  const form = await req.formData();
  let booking: ReceiptBooking;
  try {
    booking = JSON.parse(String(form.get("data") ?? ""));
  } catch {
    return jsonError("Ugyldige data");
  }
  const up = await readUpload(form, "bilde");
  if (!up.ok) return jsonError(up.error, 415);

  let entry;
  try {
    entry = buildReceiptEntry(booking, ctx.company.vat_registered);
  } catch (e) {
    return jsonError((e as Error).message, 422);
  }
  const result = await ctx.sql.begin(async (tx) => {
    const documentId = up.file
      ? await storeDocument(tx, ctx.company.id, {
          kind: "receipt_image",
          content: up.file.content,
          mediaType: up.file.mediaType,
          filename: up.file.filename,
          title: `${booking.supplierName} ${booking.date}`,
          documentDate: booking.date,
        }, ctx.user.email)
      : null;
    return insertEntry(tx, ctx.company.id, entry, ctx.user.email, documentId);
  });
  return NextResponse.json(result);
}
