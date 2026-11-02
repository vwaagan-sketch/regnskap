import { randomBytes, timingSafeEqual } from "node:crypto";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from "@/db/document-repo";

/** En innkommende e-post, uavhengig av hvilken e-posttjeneste som leverte den. */
export interface InboundMessage {
  provider: string;
  messageId: string;
  from: string;
  subject: string;
  /** Hemmelig del av mottakeradressen (etter +), hvis tjenesten har funnet den. */
  mailboxHash: string | null;
  recipients: string[];
  textBody: string;
  /** Avsender feilet SPF-sjekk eller er merket som søppelpost. */
  suspicious: boolean;
  attachments: InboundAttachment[];
}

export interface InboundAttachment {
  filename: string;
  mediaType: string;
  content: Buffer;
  /** Satt for bilder som ligger inne i selve e-postteksten (logoer, signaturer o.l.). */
  inline: boolean;
}

const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const TOKEN_RE = /^[a-z2-7]{12}$/;

/** Lager en tilfeldig innbokskode (12 tegn, 60 biter). Kun små bokstaver, så store/små bokstaver i adressen ikke spiller noen rolle. */
export function newInboxToken(): string {
  return Array.from(randomBytes(12), (b) => TOKEN_ALPHABET[b & 31]).join("");
}

/** Setter innbokskoden inn i grunnadressen: bilag@domene.no → bilag+kode@domene.no. */
export function inboxAddress(baseAddress: string | undefined, token: string): string | null {
  const m = baseAddress?.trim().match(/^([^@\s+]+)@([^@\s]+)$/);
  if (!m) return null;
  return `${m[1]}+${token}@${m[2]}`.toLowerCase();
}

/** Finner innbokskoden: fra tjenestens MailboxHash, ellers fra en mottakeradresse på formen navn+kode@domene. */
export function findInboxToken(msg: Pick<InboundMessage, "mailboxHash" | "recipients">): string | null {
  const candidates = [msg.mailboxHash ?? "", ...msg.recipients.map((r) => r.match(/\+([^@+\s]+)@/)?.[1] ?? "")];
  for (const c of candidates) {
    const t = c.trim().toLowerCase();
    if (TOKEN_RE.test(t)) return t;
  }
  return null;
}

/** Tolker listen over godkjente avsendere. Godtar hele adresser og domener (@firma.no), skilt med komma, semikolon eller linjeskift. */
export function parseAllowedSenders(text: string): { senders: string[]; invalid: string[] } {
  const senders: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const s = raw.trim().toLowerCase();
    if (!s) continue;
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s) || /^@[^@\s]+\.[a-z]{2,}$/.test(s)) {
      if (!senders.includes(s)) senders.push(s);
    } else invalid.push(raw.trim());
  }
  return { senders, invalid };
}

export function senderAllowed(from: string, allowed: string[]): boolean {
  const addr = from.trim().toLowerCase();
  const domain = addr.slice(addr.lastIndexOf("@"));
  return allowed.some((a) => a === addr || (a.startsWith("@") && a === domain));
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  xml: "application/xml",
  txt: "text/plain",
  csv: "text/csv",
};

/** Normaliserer filtypen. E-postprogrammer sender ofte «application/octet-stream», og da brukes filendelsen. */
export function normalizeMediaType(contentType: string, filename: string): string {
  let t = contentType.split(";")[0].trim().toLowerCase();
  if (t === "image/jpg" || t === "image/pjpeg") t = "image/jpeg";
  if (ALLOWED_DOCUMENT_TYPES.includes(t)) return t;
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return EXTENSION_TYPES[ext] ?? t;
}

/** Bilder under denne størrelsen som ligger inne i e-postteksten regnes som logoer og signaturer. */
export const INLINE_IMAGE_MIN_BYTES = 30 * 1024;

export interface AttachmentSelection {
  accepted: InboundAttachment[];
  /** Filer som ikke ble arkivert, med forklaring. */
  skipped: string[];
}

/** Velger hvilke vedlegg som skal i arkivet. */
export function selectAttachments(attachments: InboundAttachment[]): AttachmentSelection {
  const accepted: InboundAttachment[] = [];
  const skipped: string[] = [];
  for (const a of attachments) {
    const mediaType = normalizeMediaType(a.mediaType, a.filename);
    if (a.inline && mediaType.startsWith("image/") && a.content.length < INLINE_IMAGE_MIN_BYTES) continue;
    if (!ALLOWED_DOCUMENT_TYPES.includes(mediaType)) {
      skipped.push(`${a.filename}: filtypen ${mediaType || "ukjent"} støttes ikke`);
    } else if (a.content.length > MAX_DOCUMENT_BYTES) {
      skipped.push(`${a.filename}: større enn 10 MB`);
    } else if (a.content.length === 0) {
      skipped.push(`${a.filename}: tom fil`);
    } else {
      accepted.push({ ...a, mediaType });
    }
  }
  return { accepted, skipped };
}

/** Når e-posten ikke har vedlegg (f.eks. en kvittering i selve teksten), arkiveres teksten. */
export function bodyAsDocument(msg: InboundMessage): InboundAttachment | null {
  const body = msg.textBody.trim();
  if (!body) return null;
  const text = `Fra: ${msg.from}\nEmne: ${msg.subject}\n\n${body}\n`;
  return { filename: "e-post.txt", mediaType: "text/plain", content: Buffer.from(text, "utf8"), inline: false };
}

/** Sjekker Basic-autentisering mot webhook-passordet. Brukernavnet ignoreres. */
export function checkBasicAuth(header: string | null, password: string): boolean {
  const m = header?.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const given = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const expected = Buffer.from(password);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
