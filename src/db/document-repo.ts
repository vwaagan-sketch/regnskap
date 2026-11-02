import { createHash } from "node:crypto";
import type postgres from "postgres";

/** Siste dag dokumentet må oppbevares: 5 år etter utgangen av regnskapsåret (bokføringsloven § 13). */
export function retainUntil(documentDate: string): string {
  const year = Number(documentDate.slice(0, 4));
  return `${year + 5}-12-31`;
}

export const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
  "application/xml",
  "text/xml",
  "text/plain",
  "text/csv",
];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface NewDocument {
  kind: string;
  content: Buffer;
  mediaType: string;
  documentDate: string;
  filename?: string | null;
  title?: string | null;
}

/** Dokumenttype i arkivet ut fra filtypen. */
export function kindFor(mediaType: string): string {
  return mediaType.startsWith("image/") ? "image" : mediaType === "application/pdf" ? "pdf" : "file";
}

export async function storeDocument(
  tx: postgres.TransactionSql,
  companyId: number,
  d: NewDocument,
  actor = "bruker",
): Promise<string> {
  const sha = createHash("sha256").update(d.content).digest("hex");
  const [doc] = await tx<{ id: string }[]>`
    INSERT INTO document (company_id, kind, storage_key, sha256, retain_until, filename, title, size_bytes, document_date)
    VALUES (${companyId}, ${d.kind}, ${"db:" + sha}, ${sha}, ${retainUntil(d.documentDate)},
            ${d.filename ?? null}, ${d.title ?? null}, ${d.content.length}, ${d.documentDate})
    RETURNING id::text`;
  await tx`INSERT INTO document_blob (document_id, media_type, content) VALUES (${doc.id}, ${d.mediaType}, ${d.content})`;
  await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
           VALUES (${companyId}, ${actor}, 'upload', 'document', ${doc.id}, ${tx.json({ kind: d.kind, filename: d.filename ?? null, sha256: sha })})`;
  return doc.id;
}

export async function getDocument(sql: postgres.Sql, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await sql<{ media_type: string; content: Buffer; filename: string | null }[]>`
    SELECT b.media_type, b.content, d.filename
    FROM document_blob b JOIN document d ON d.id = b.document_id WHERE b.document_id = ${id}`;
  return row ?? null;
}

export interface DocumentListItem {
  id: string;
  kind: string;
  filename: string | null;
  title: string | null;
  media_type: string;
  size_bytes: number | null;
  document_date: string | null;
  created_at: string;
  retain_until: string;
  voucher_no: number | null;
  entry_description: string | null;
  /** Avsender når dokumentet kom inn på e-post. */
  email_from: string | null;
}

export async function listDocuments(
  sql: postgres.Sql,
  companyId: number,
  filter: "alle" | "ubokfort" = "alle",
): Promise<DocumentListItem[]> {
  return sql<DocumentListItem[]>`
    SELECT d.id::text, d.kind, d.filename, d.title, b.media_type, d.size_bytes,
           to_char(d.document_date, 'YYYY-MM-DD') AS document_date,
           to_char(d.created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
           to_char(d.retain_until, 'YYYY-MM-DD') AS retain_until,
           e.voucher_no, e.description AS entry_description, m.from_address AS email_from
    FROM document d
    JOIN document_blob b ON b.document_id = d.id
    LEFT JOIN journal_entry e ON e.document_id = d.id
    LEFT JOIN inbound_email_document md ON md.document_id = d.id
    LEFT JOIN inbound_email m ON m.id = md.email_id
    WHERE d.company_id = ${companyId}
      ${filter === "ubokfort" ? sql`AND e.id IS NULL AND d.kind NOT IN ('invoice_pdf')` : sql``}
    ORDER BY d.created_at DESC
    LIMIT 500`;
}

export async function isDocumentLinked(tx: postgres.TransactionSql | postgres.Sql, id: string): Promise<boolean> {
  const rows = await tx`SELECT 1 FROM journal_entry WHERE document_id = ${id} LIMIT 1`;
  return rows.length > 0;
}
