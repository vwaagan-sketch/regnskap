import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { saveCompany, getCompany, type CompanyRow } from "@/db/company-repo";
import { createCustomer, issueInvoice, registerPayment, listInvoices } from "@/db/invoice-repo";
import { insertEntry, trialBalanceForYear } from "@/db/ledger-repo";
import { storeDocument, listDocuments } from "@/db/document-repo";
import { buildReceiptEntry } from "@/lib/receipt/booking";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("fakturaflyt mot database", () => {
  const sql = postgres(url ?? "", { onnotice: () => {} });
  let company: CompanyRow;

  beforeAll(async () => {
    await sql`TRUNCATE company RESTART IDENTITY CASCADE`.catch(() => {});
    await saveCompany(sql, {
      name: "Test AS", org_no: "999888777", address: "Gate 1", postal_code: "0150", city: "Oslo",
      vat_registered: true, in_business_register: true, bank_account: "12345678903",
    });
    company = (await getCompany(sql))!;
  });
  afterAll(() => sql.end());

  it("utsteder faktura med løpenummer, KID og postering, og registrerer betaling", async () => {
    const customerId = await createCustomer(sql, company.id, {
      name: "Kunde AS", org_no: "987654321", email: null, address: "Vei 2", postal_code: "5003", city: "Bergen",
    });
    const a = await issueInvoice(sql, company, {
      customerId, issueDate: "2026-11-01", dueDate: "2026-11-15", deliveryDate: "2026-11-01",
      lines: [{ description: "Rådgivning", quantity: 2, unitPriceOre: 100000, vatCategory: "high" }],
    });
    const b = await issueInvoice(sql, company, {
      customerId, issueDate: "2026-11-02", dueDate: "2026-11-16", deliveryDate: "2026-11-02",
      lines: [{ description: "Kurs", quantity: 1, unitPriceOre: 50000, vatCategory: "high" }],
    });
    expect(b.number).toBe(a.number + 1);
    await registerPayment(sql, company.id, a.id, "2026-11-10", 250000);
    await expect(registerPayment(sql, company.id, a.id, "2026-11-10", 1)).rejects.toThrow(/større enn/);

    const credit = await issueInvoice(sql, company, {
      kind: "credit_note", creditsInvoiceId: b.id, customerId, issueDate: "2026-11-03", dueDate: "2026-11-03",
      deliveryDate: "2026-11-02", lines: [{ description: "Kurs", quantity: 1, unitPriceOre: 50000, vatCategory: "high" }],
    });
    expect(credit.number).toBe(b.number + 1);
    const list = await listInvoices(sql, company.id);
    const invB = list.find((i) => i.id === b.id)!;
    expect(Number(invB.paid_ore)).toBe(62500);

    const tb = await trialBalanceForYear(sql, company.id, 2026);
    const bal = Object.fromEntries(tb.map((r) => [r.account, Number(r.balance_ore)]));
    expect(bal["1500"]).toBe(0);
    expect(bal["1920"]).toBe(250000);
    expect(bal["3000"]).toBe(-200000);
    expect(bal["2700"]).toBe(-50000);
    expect(tb.reduce((s, r) => s + Number(r.balance_ore), 0)).toBe(0);
  });

  it("bokfører kvittering med vedlegg i arkivet", async () => {
    const entry = buildReceiptEntry({
      date: "2026-11-05", supplierName: "Clas Ohlson", description: "Kabler", expenseAccount: "6800",
      totalOre: 12500, paid: true, vatLines: [{ ratePercent: 25, baseOre: 10000, vatOre: 2500 }],
    }, true);
    const res = await sql.begin(async (tx) => {
      const docId = await storeDocument(tx, company.id, {
        kind: "receipt_image", content: Buffer.from("bilde"), mediaType: "image/jpeg", documentDate: "2026-11-05", filename: "k.jpg",
      });
      return insertEntry(tx, company.id, entry, "test", docId);
    });
    expect(res.voucherNo).toBeGreaterThan(0);
    const docs = await listDocuments(sql, company.id);
    expect(docs[0]).toMatchObject({ voucher_no: res.voucherNo, retain_until: "2031-12-31" });
    expect(await listDocuments(sql, company.id, "ubokfort")).toHaveLength(0);
    await expect(sql`DELETE FROM document_blob`).rejects.toThrow(/uforanderlig/);
  });
});
