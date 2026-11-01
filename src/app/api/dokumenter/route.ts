import { NextResponse } from "next/server";
import { apiContext } from "@/db/context";
import { storeDocument } from "@/db/document-repo";
import { jsonError, readUpload, today } from "@/lib/http";

/** Laster opp ett eller flere dokumenter til arkivet. */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await apiContext();
  } catch (e) {
    return jsonError((e as Error).message, 503);
  }
  const form = await req.formData();
  const files = form.getAll("filer").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return jsonError("Velg minst én fil");
  const ids: string[] = [];
  for (const f of files) {
    const single = new FormData();
    single.set("fil", f);
    const up = await readUpload(single, "fil");
    if (!up.ok) return jsonError(`${f.name}: ${up.error}`, 415);
  }
  await ctx.sql.begin(async (tx) => {
    for (const f of files) {
      const single = new FormData();
      single.set("fil", f);
      const up = await readUpload(single, "fil");
      if (!up.ok || !up.file) continue;
      ids.push(
        await storeDocument(tx, ctx.company.id, {
          kind: up.file.mediaType.startsWith("image/") ? "image" : up.file.mediaType === "application/pdf" ? "pdf" : "file",
          content: up.file.content,
          mediaType: up.file.mediaType,
          filename: up.file.filename,
          title: String(form.get("tittel") ?? "").trim() || null,
          documentDate: today(),
        }),
      );
    }
  });
  return NextResponse.json({ ids });
}
