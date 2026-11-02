import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { createCompany, getCompanyById, type CompanyRow } from "@/db/company-repo";
import { createCustomer, issueInvoice, getInvoice } from "@/db/invoice-repo";
import { insertEntry } from "@/db/ledger-repo";
import {
  approveSafeSuggestions, importStatement, listBankTransactions, reconcileTransaction,
  reconciliationSuggestions, reconciliationSummary, unmatchTransaction,
} from "@/db/bank-repo";
import { CAMT } from "./fixtures/camt053";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("bankimport og avstemming mot database", () => {
  const sql = postgres(url ?? "", { onnotice: () => {} });
  let company: CompanyRow;

  beforeAll(async () => {
    await sql`TRUNCATE company RESTART IDENTITY CASCADE`.catch(() => {});
    const id = await sql.begin((tx) => createCompany(tx, {
      name: "Bank AS", org_no: "999888776", address: "Gate 1", postal_code: "0150", city: "Oslo",
      vat_registered: true, in_business_register: true, bank_account: "12345678903",
    }, "test"));
    company = (await getCompanyById(sql, id as number))!;
  });
  afterAll(() => sql.end());

  it("importerer, foreslår, avstemmer og lager avstemmingsrapport", async () => {
    // Åpningsbalanse 10 000 kr i regnskapet før første kontoutskrift.
    await sql.begin((tx) => insertEntry(tx, company.id, {
      date: "2026-09-30", description: "Åpningsbalanse", documentRef: "ib:2026",
      lines: [{ account: "1920", amount: 1000000 }, { account: "2050", amount: -1000000 }],
    }, "test"));
    const customerId = await createCustomer(sql, company.id, {
      name: "Kunde AS", org_no: null, email: null, address: "Vei 2", postal_code: "5003", city: "Bergen",
    });
    // Faktura 1 (KID fra kundenr 10001 + faktura 1) og faktura 2 med samme kunde.
    const inv1 = await issueInvoice(sql, company, {
      customerId, issueDate: "2026-10-01", dueDate: "2026-10-15", deliveryDate: "2026-10-01",
      lines: [{ description: "Rådgivning", quantity: 1, unitPriceOre: 200000, vatCategory: "high" }],
    });
    const kid = (await getInvoice(sql, company.id, inv1.id))!.snapshot.invoice.kid!;
    // Telefonregning allerede bokført fra kvittering.
    const tel = await sql.begin((tx) => insertEntry(tx, company.id, {
      date: "2026-10-19", description: "Telenor mobil", documentRef: "kvittering:1",
      lines: [{ account: "6900", amount: 4800 }, { account: "2710", amount: 1200 }, { account: "1920", amount: -6000 }],
    }, "test"));

    const file = Buffer.from(CAMT.replace("<Ref>1000110</Ref>", `<Ref>${kid}</Ref>`));
    const r = await importStatement(sql, company, { content: file, filename: "okt.xml", mediaType: "application/xml" }, "2026-11-01");
    expect(r).toMatchObject({ statements: 1, imported: 4, duplicates: 0 });
    await expect(importStatement(sql, company, { content: file, filename: "okt.xml", mediaType: "application/xml" }, "2026-11-01"))
      .rejects.toThrow(/allerede importert/);
    // Overlappende fil (annet innhold, samme transaksjoner) gir ingen duplikater.
    const again = await importStatement(sql, company, { content: Buffer.from(file.toString() + "\n"), filename: "okt2.xml", mediaType: "application/xml" }, "2026-11-01");
    expect(again).toMatchObject({ imported: 0, duplicates: 4 });

    const wrong = Buffer.from(CAMT.replace("NO9312345678903", "NO0298765432109"));
    await expect(importStatement(sql, company, { content: wrong, filename: "x.xml", mediaType: "application/xml" }, "2026-11-01"))
      .rejects.toThrow(/firmaets bankkonto/);

    const { suggestions, open } = await reconciliationSuggestions(sql, company.id);
    expect(open).toHaveLength(4);
    const byAmount = new Map(open.map((t) => [Number(t.amount_ore), t.id]));
    expect(suggestions.get(byAmount.get(250000)!)).toMatchObject({ kind: "invoice", confidence: "sikker" });
    expect(suggestions.get(byAmount.get(-6000)!)).toMatchObject({ kind: "entry", entryId: tel.id, confidence: "sikker" });

    expect(await approveSafeSuggestions(sql, company)).toBe(2);
    const paid = await getInvoice(sql, company.id, inv1.id);
    expect(Number(paid!.paid_ore)).toBe(250000);

    // Gebyr bokføres direkte fra banklinjen mot 7770 med kontoutskriften som vedlegg.
    const fee = byAmount.get(-12500)!;
    const posted = await reconcileTransaction(sql, company, fee, { kind: "new", account: "7770" });
    const [feeEntry] = await sql`SELECT document_id FROM journal_entry WHERE voucher_no = ${posted.voucherNo} AND company_id = ${company.id}`;
    expect(feeEntry.document_id).toBe(r.documentId);
    await expect(reconcileTransaction(sql, company, fee, { kind: "new", account: "7770" })).rejects.toThrow(/allerede avstemt/);

    // Koblingen til bokført bilag kan fjernes, men ikke kobling der posteringen ble laget fra banken.
    const telTx = byAmount.get(-6000)!;
    await unmatchTransaction(sql, company.id, telTx);
    await expect(unmatchTransaction(sql, company.id, fee)).rejects.toThrow(/Reverser/);
    await expect(sql`DELETE FROM bank_match WHERE transaction_id = ${fee}`).rejects.toThrow(/kan ikke endres/);
    await expect(sql`UPDATE bank_transaction SET amount_ore = 1 WHERE id = ${fee}`).rejects.toThrow(/uforanderlig/);
    await expect(reconcileTransaction(sql, company, telTx, { kind: "entry", entryId: posted.voucherNo.toString() }))
      .rejects.toThrow();
    await reconcileTransaction(sql, company, telTx, { kind: "entry", entryId: tel.id });

    // 625 kr fra «Annen & Kunde» er ikke bokført ennå.
    const summary = await reconciliationSummary(sql, company.id);
    expect(summary).toMatchObject({
      date: "2026-10-31",
      startDate: "2026-10-01",
      bankBalanceOre: 1294000,
      openingDiffOre: 0,
      unmatchedBankCount: 1,
      unmatchedBankOre: 62500,
      unmatchedLedgerCount: 0,
      unexplainedOre: 0,
    });
    expect(summary.ledgerBalanceOre).toBe(1294000 - 62500);

    const matched = await listBankTransactions(sql, company.id, "matched");
    expect(matched.map((m) => m.match_kind).sort()).toEqual(["existing_entry", "invoice_payment", "new_entry"]);
  });
});
