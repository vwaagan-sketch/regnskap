import { apiContext, apiErrorStatus } from "@/db/context";
import { getDocument } from "@/db/document-repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await apiContext("lese");
  } catch (e) {
    return new Response((e as Error).message, { status: apiErrorStatus(e) });
  }
  const { id } = await params;
  const doc = await getDocument(ctx.sql, ctx.company.id, id);
  if (!doc) return new Response("Fant ikke dokumentet", { status: 404 });
  const name = encodeURIComponent(doc.filename ?? `dokument-${id}`);
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.media_type,
      "Content-Disposition": `inline; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
