import { apiContext, apiErrorStatus } from "@/db/context";
import { getAMelding } from "@/db/payroll-repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await apiContext("skriv");
  } catch (e) {
    return new Response((e as Error).message, { status: apiErrorStatus(e) });
  }
  const { id } = await params;
  const row = await getAMelding(ctx.sql, ctx.company.id, Number(id));
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
