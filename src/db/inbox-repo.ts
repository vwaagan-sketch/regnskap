import type postgres from "postgres";
import { kindFor, storeDocument } from "./document-repo";
import { bodyAsDocument, findInboxToken, newInboxToken, selectAttachments, senderAllowed, type InboundMessage } from "@/lib/inbound/message";
import { today } from "@/lib/http";

export interface InboxRow {
  company_id: number;
  token: string;
  allowed_senders: string[];
}

/** Henter firmaets innboks, og oppretter den første gang. */
export async function getOrCreateInbox(sql: postgres.Sql, companyId: number): Promise<InboxRow> {
  await sql`INSERT INTO company_inbox (company_id, token) VALUES (${companyId}, ${newInboxToken()}) ON CONFLICT (company_id) DO NOTHING`;
  const [row] = await sql<InboxRow[]>`SELECT company_id, token, allowed_senders FROM company_inbox WHERE company_id = ${companyId}`;
  return row;
}

export async function setAllowedSenders(sql: postgres.Sql, companyId: number, senders: string[], actor = "bruker"): Promise<void> {
  await getOrCreateInbox(sql, companyId);
  await sql.begin(async (tx) => {
    await tx`UPDATE company_inbox SET allowed_senders = ${senders} WHERE company_id = ${companyId}`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, ${actor}, 'save', 'company_inbox', ${String(companyId)}, ${tx.json({ allowed_senders: senders })})`;
  });
}

/** Lager ny innboksadresse, f.eks. hvis den gamle har kommet på avveie. Den gamle slutter å virke straks. */
export async function rotateInboxToken(sql: postgres.Sql, companyId: number, actor = "bruker"): Promise<void> {
  await getOrCreateInbox(sql, companyId);
  await sql.begin(async (tx) => {
    await tx`UPDATE company_inbox SET token = ${newInboxToken()} WHERE company_id = ${companyId}`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, ${actor}, 'rotate', 'company_inbox', ${String(companyId)}, ${tx.json({})})`;
  });
}

export type ReceiveResult =
  | { status: "mottatt"; documentIds: string[]; skipped: string[] }
  | { status: "duplikat" }
  | { status: "avvist"; reason: string; logged: boolean };

/**
 * Tar imot en e-post: finner firmaet ut fra adressen, sjekker avsenderen og legger vedleggene i arkivet.
 * Alt skjer i én transaksjon, og samme e-post (message-id) tas bare imot én gang.
 */
export async function receiveEmail(sql: postgres.Sql, msg: InboundMessage): Promise<ReceiveResult> {
  const token = findInboxToken(msg);
  if (!token) return { status: "avvist", reason: "Fant ingen innbokskode i mottakeradressen", logged: false };
  const [inbox] = await sql<InboxRow[]>`SELECT company_id, token, allowed_senders FROM company_inbox WHERE token = ${token}`;
  if (!inbox) return { status: "avvist", reason: "Ukjent innboksadresse", logged: false };

  let reason: string | null = null;
  if (msg.suspicious) reason = "Avsenderen ble ikke bekreftet (SPF) eller e-posten er merket som søppelpost";
  else if (inbox.allowed_senders.length === 0) reason = "Ingen godkjente avsendere er lagt inn";
  else if (!senderAllowed(msg.from, inbox.allowed_senders)) reason = `${msg.from} er ikke en godkjent avsender`;

  const { accepted, skipped } = selectAttachments(msg.attachments);
  const files = accepted.length > 0 ? accepted : [bodyAsDocument(msg)].filter((f) => f !== null);
  if (!reason && files.length === 0) reason = "E-posten hadde verken vedlegg eller tekst";

  return sql.begin(async (tx) => {
    const [email] = await tx<{ id: number }[]>`
      INSERT INTO inbound_email (company_id, provider, message_id, from_address, subject, status, reason, skipped)
      VALUES (${inbox.company_id}, ${msg.provider}, ${msg.messageId}, ${msg.from}, ${msg.subject.slice(0, 500)},
              ${reason ? "avvist" : "mottatt"}, ${reason}, ${skipped})
      ON CONFLICT (provider, message_id) DO NOTHING
      RETURNING id`;
    if (!email) return { status: "duplikat" } as const;
    if (reason) return { status: "avvist", reason, logged: true } as const;

    const documentIds: string[] = [];
    for (const f of files) {
      const id = await storeDocument(
        tx,
        inbox.company_id,
        {
          kind: kindFor(f.mediaType),
          content: f.content,
          mediaType: f.mediaType,
          filename: f.filename,
          title: msg.subject || null,
          documentDate: today(),
        },
        "e-post",
      );
      await tx`INSERT INTO inbound_email_document (email_id, document_id) VALUES (${email.id}, ${id})`;
      documentIds.push(id);
    }
    return { status: "mottatt", documentIds, skipped } as const;
  }) as Promise<ReceiveResult>;
}

export interface InboundEmailItem {
  id: number;
  from_address: string;
  subject: string;
  status: "mottatt" | "avvist";
  reason: string | null;
  skipped: string[];
  received_at: string;
  documents: number;
}

export async function listInboundEmails(sql: postgres.Sql, companyId: number, limit = 10): Promise<InboundEmailItem[]> {
  return sql<InboundEmailItem[]>`
    SELECT m.id, m.from_address, m.subject, m.status, m.reason, m.skipped,
           to_char(m.received_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD HH24:MI') AS received_at,
           (SELECT count(*)::int FROM inbound_email_document md WHERE md.email_id = m.id) AS documents
    FROM inbound_email m
    WHERE m.company_id = ${companyId}
    ORDER BY m.received_at DESC
    LIMIT ${limit}`;
}
