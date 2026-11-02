import { apiContext } from "@/db/context";
import { getInvoice } from "@/db/invoice-repo";
import { download } from "@/lib/download";
import { buildEhf } from "@/lib/ehf";
import { jsonError } from "@/lib/http";

/** EHF (Peppol BIS Billing 3.0) for en utstedt faktura eller kreditnota. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { sql, company } = await apiContext();
    const inv = await getInvoice(sql, company.id, Number((await params).id));
    if (!inv) return jsonError("Fant ikke fakturaen", 404);
    const { invoice, totals, customerNo } = inv.snapshot;
    const xml = buildEhf(invoice, totals, String(customerNo));
    const name = `${inv.kind === "credit_note" ? "kreditnota" : "faktura"}-${inv.number}.xml`;
    return download(xml, name, "application/xml; charset=utf-8");
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
