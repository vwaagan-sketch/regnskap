import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import {
  bodyAsDocument, checkBasicAuth, findInboxToken, inboxAddress, newInboxToken, normalizeMediaType,
  parseAllowedSenders, selectAttachments, senderAllowed, type InboundAttachment,
} from "@/lib/inbound/message";
import { parsePostmark } from "@/lib/inbound/postmark";
import { getOrCreateInbox, listInboundEmails, receiveEmail, rotateInboxToken, setAllowedSenders } from "@/db/inbox-repo";
import { listDocuments } from "@/db/document-repo";

const pdf = Buffer.from("%PDF-1.4 kvittering");

function postmarkPayload(over: Record<string, unknown> = {}) {
  return {
    MessageID: `msg-${Math.random()}`,
    From: "Vegard <vegard@example.no>",
    FromFull: { Email: "Vegard@Example.no", Name: "Vegard" },
    Subject: "Fwd: Kvittering fra Clas Ohlson",
    MailboxHash: "",
    OriginalRecipient: "",
    ToFull: [{ Email: "abc@inbound.postmarkapp.com", Name: "", MailboxHash: "" }],
    TextBody: "Sum 249,00",
    Headers: [{ Name: "Received-SPF", Value: "pass (example.no)" }],
    Attachments: [{ Name: "kvittering.pdf", Content: pdf.toString("base64"), ContentType: "application/pdf", ContentLength: pdf.length }],
    ...over,
  };
}

describe("innkommende e-post", () => {
  it("lager innbokskoder og adresser", () => {
    const t = newInboxToken();
    expect(t).toMatch(/^[a-z2-7]{12}$/);
    expect(newInboxToken()).not.toBe(t);
    expect(inboxAddress("abc123@inbound.postmarkapp.com", t)).toBe(`abc123+${t}@inbound.postmarkapp.com`);
    expect(inboxAddress("Bilag@Firma.no", "aaaaaaaaaaaa")).toBe("bilag+aaaaaaaaaaaa@firma.no");
    expect(inboxAddress(undefined, t)).toBeNull();
    expect(inboxAddress("ikke en adresse", t)).toBeNull();
  });

  it("finner innbokskoden fra MailboxHash eller mottakeradressen", () => {
    expect(findInboxToken({ mailboxHash: "ABCDEFGHIJKL", recipients: [] })).toBe("abcdefghijkl");
    expect(findInboxToken({ mailboxHash: null, recipients: ["x@y.no", "bilag+abcdefghijk2@firma.no"] })).toBe("abcdefghijk2");
    expect(findInboxToken({ mailboxHash: "kort", recipients: ["bilag@firma.no"] })).toBeNull();
  });

  it("tolker og sjekker godkjente avsendere", () => {
    const { senders, invalid } = parseAllowedSenders("Vegard@Example.no, @firma.no\n\nfeil;vegard@example.no");
    expect(senders).toEqual(["vegard@example.no", "@firma.no"]);
    expect(invalid).toEqual(["feil"]);
    expect(senderAllowed("vegard@example.no", senders)).toBe(true);
    expect(senderAllowed("ola@firma.no", senders)).toBe(true);
    expect(senderAllowed("ola@ikkefirma.no", senders)).toBe(false);
    expect(senderAllowed("ola@sub.firma.no", senders)).toBe(false);
  });

  it("normaliserer filtyper og velger vedlegg", () => {
    expect(normalizeMediaType("application/octet-stream", "Faktura.PDF")).toBe("application/pdf");
    expect(normalizeMediaType("image/jpg; name=a.jpg", "a.jpg")).toBe("image/jpeg");
    const att = (filename: string, mediaType: string, bytes: number, inline = false): InboundAttachment =>
      ({ filename, mediaType, content: Buffer.alloc(bytes, 1), inline });
    const { accepted, skipped } = selectAttachments([
      att("logo.png", "image/png", 2000, true),
      att("bilde.jpg", "image/jpeg", 200_000, true),
      att("faktura.pdf", "application/octet-stream", 1000),
      att("tegning.dwg", "application/acad", 1000),
      att("stor.pdf", "application/pdf", 11 * 1024 * 1024),
    ]);
    expect(accepted.map((a) => [a.filename, a.mediaType])).toEqual([["bilde.jpg", "image/jpeg"], ["faktura.pdf", "application/pdf"]]);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toMatch(/tegning\.dwg.*støttes ikke/);
  });

  it("leser Postmark-format", () => {
    const m = parsePostmark(postmarkPayload({ MailboxHash: "abcdefghijkl", Headers: [{ Name: "X-Spam-Status", Value: "Yes" }] }))!;
    expect(m.from).toBe("vegard@example.no");
    expect(m.mailboxHash).toBe("abcdefghijkl");
    expect(m.suspicious).toBe(true);
    expect(m.attachments[0].content.equals(pdf)).toBe(true);
    expect(parsePostmark({ hei: 1 })).toBeNull();
    expect(bodyAsDocument(m)?.content.toString()).toContain("Sum 249,00");
  });

  it("sjekker webhook-passord", () => {
    const h = (s: string) => `Basic ${Buffer.from(s).toString("base64")}`;
    expect(checkBasicAuth(h("postmark:hemmelig"), "hemmelig")).toBe(true);
    expect(checkBasicAuth(h("postmark:feil"), "hemmelig")).toBe(false);
    expect(checkBasicAuth(null, "hemmelig")).toBe(false);
  });
});

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("mottak av e-post mot database", () => {
  const sql = postgres(url ?? "", { onnotice: () => {} });
  let companyId = 0;
  let token = "";

  beforeAll(async () => {
    const orgNo = String(100000000 + Math.floor(Math.random() * 899999999));
    [{ id: companyId }] = await sql<{ id: number }[]>`
      INSERT INTO company (name, org_no, address, postal_code, city, bank_account)
      VALUES ('Epost AS', ${orgNo}, 'Gate 1', '0150', 'Oslo', '12345678903') RETURNING id`;
    token = (await getOrCreateInbox(sql, companyId)).token;
  });
  afterAll(() => sql.end());

  const msg = (over: Record<string, unknown> = {}) => parsePostmark(postmarkPayload({ MailboxHash: token, ...over }))!;

  it("oppretter innboksen bare én gang", async () => {
    expect((await getOrCreateInbox(sql, companyId)).token).toBe(token);
  });

  it("avviser når ingen avsendere er godkjent, og ukjente adresser", async () => {
    const r = await receiveEmail(sql, msg());
    expect(r).toMatchObject({ status: "avvist", logged: true });
    expect(await receiveEmail(sql, msg({ MailboxHash: "zzzzzzzzzzzz" }))).toMatchObject({ status: "avvist", logged: false });
  });

  it("arkiverer vedlegg fra godkjent avsender, og bare én gang", async () => {
    await setAllowedSenders(sql, companyId, ["vegard@example.no"]);
    const m = msg();
    const r = await receiveEmail(sql, m);
    expect(r.status).toBe("mottatt");
    if (r.status !== "mottatt") return;
    expect(r.documentIds).toHaveLength(1);
    expect(await receiveEmail(sql, m)).toEqual({ status: "duplikat" });

    const docs = await listDocuments(sql, companyId, "ubokfort");
    const doc = docs.find((x) => x.id === r.documentIds[0])!;
    expect(doc).toMatchObject({ filename: "kvittering.pdf", media_type: "application/pdf", email_from: "vegard@example.no" });
    expect(doc.title).toBe("Fwd: Kvittering fra Clas Ohlson");
    const [audit] = await sql`SELECT actor FROM audit_log WHERE entity_id = ${doc.id}`;
    expect(audit.actor).toBe("e-post");
  });

  it("arkiverer teksten når det ikke er vedlegg, og avviser fremmede avsendere", async () => {
    const r = await receiveEmail(sql, msg({ Attachments: [] }));
    expect(r.status).toBe("mottatt");
    const fremmed = await receiveEmail(sql, msg({ FromFull: { Email: "svindel@example.com" } }));
    expect(fremmed).toMatchObject({ status: "avvist", reason: expect.stringMatching(/ikke en godkjent avsender/) });
    const log = await listInboundEmails(sql, companyId);
    expect(log[0]).toMatchObject({ status: "avvist", from_address: "svindel@example.com" });
    expect(log.filter((l) => l.status === "mottatt")).toHaveLength(2);
  });

  it("gammel adresse slutter å virke etter ny adresse", async () => {
    await rotateInboxToken(sql, companyId);
    expect(await receiveEmail(sql, msg())).toMatchObject({ status: "avvist", logged: false });
  });
});
