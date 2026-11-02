import { NextResponse } from "next/server";
import { apiContext } from "@/db/context";
import { importStatement } from "@/db/bank-repo";
import { MAX_DOCUMENT_BYTES } from "@/db/document-repo";
import { StatementError } from "@/lib/bank/statement";
import { XmlError } from "@/lib/bank/xml";
import { jsonError, today } from "@/lib/http";

/** Importerer kontoutskrift (CAMT.053-XML eller CSV fra nettbanken). */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await apiContext();
  } catch (e) {
    return jsonError((e as Error).message, 503);
  }
  const form = await req.formData();
  const f = form.get("fil");
  if (!(f instanceof File) || f.size === 0) return jsonError("Velg en kontoutskrift");
  if (f.size > MAX_DOCUMENT_BYTES) return jsonError("Filen er større enn 10 MB");
  if (!/\.(xml|csv|txt|053)$/i.test(f.name) && !/(xml|csv|text\/plain|ms-excel)/.test(f.type)) {
    return jsonError("Last opp kontoutskrift som CAMT.053 (XML) eller CSV", 415);
  }
  try {
    const r = await importStatement(
      ctx.sql,
      ctx.company,
      { content: Buffer.from(await f.arrayBuffer()), filename: f.name, mediaType: f.type },
      today(),
    );
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof StatementError || e instanceof XmlError) return jsonError(e.message, 422);
    throw e;
  }
}
