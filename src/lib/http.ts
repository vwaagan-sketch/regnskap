import { NextResponse } from "next/server";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/db/document-repo";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Leser en opplastet fil fra skjemaet og sjekker type og størrelse. */
export async function readUpload(form: FormData, field: string): Promise<
  { ok: true; file: { content: Buffer; mediaType: string; filename: string } | null } | { ok: false; error: string }
> {
  const f = form.get(field);
  if (!(f instanceof File) || f.size === 0) return { ok: true, file: null };
  const type = f.type || "application/octet-stream";
  if (!ALLOWED_DOCUMENT_TYPES.includes(type)) return { ok: false, error: `Filtypen ${type} støttes ikke` };
  if (f.size > MAX_DOCUMENT_BYTES) return { ok: false, error: "Filen er større enn 10 MB" };
  return { ok: true, file: { content: Buffer.from(await f.arrayBuffer()), mediaType: type, filename: f.name } };
}

export function today(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
}
