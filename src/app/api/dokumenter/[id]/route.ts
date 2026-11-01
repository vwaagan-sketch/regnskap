import { getSql } from "@/db/client";
import { getDocument } from "@/db/document-repo";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sql = getSql();
  if (!sql) return new Response("Databasen er ikke koblet til", { status: 503 });
  const { id } = await params;
  const doc = await getDocument(sql, id);
  if (!doc) return new Response("Fant ikke dokumentet", { status: 404 });
  const name = encodeURIComponent(doc.filename ?? `dokument-${id}`);
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.media_type,
      "Content-Disposition": `inline; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
