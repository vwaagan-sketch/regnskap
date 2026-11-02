import { apiContext } from "@/db/context";
import { exportSaft, saftFilename } from "@/db/saft-repo";
import { download } from "@/lib/download";
import { jsonError } from "@/lib/http";

/** SAF-T Regnskap for ett år (eller et utvalg måneder). */
export async function GET(req: Request) {
  try {
    const { sql, company } = await apiContext();
    const q = new URL(req.url).searchParams;
    const year = Number(q.get("ar"));
    const fromMonth = Number(q.get("fra") ?? 1);
    const toMonth = Number(q.get("til") ?? 12);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return jsonError("Ugyldig år", 400);
    if (!(fromMonth >= 1 && toMonth <= 12 && fromMonth <= toMonth)) return jsonError("Ugyldige måneder", 400);
    const contactName = (q.get("kontakt") ?? "").trim() || company.name;
    const xml = await exportSaft(sql, company, { year, fromMonth, toMonth, contactName });
    return download(xml, saftFilename(company.org_no), "application/xml; charset=utf-8");
  } catch (e) {
    return jsonError((e as Error).message, 500);
  }
}
