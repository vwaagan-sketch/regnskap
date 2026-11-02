import { getSql } from "@/db/client";
import { getCompany } from "@/db/company-repo";
import { getAMelding } from "@/db/payroll-repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sql = getSql();
  if (!sql) return new Response("Databasen er ikke koblet til", { status: 503 });
  const company = await getCompany(sql);
  if (!company) return new Response("Firmaet er ikke registrert", { status: 404 });
  const { id } = await params;
  const row = await getAMelding(sql, company.id, Number(id));
  if (!row) return new Response("Fant ikke a-meldingen", { status: 404 });
  return new Response(row.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="a-melding-${row.period}-${row.melding_id.slice(0, 8)}.xml"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
