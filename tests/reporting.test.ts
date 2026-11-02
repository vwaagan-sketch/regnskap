import { describe, expect, it } from "vitest";
import { buildVatReport, termOf, termPeriod } from "@/lib/vat-report";
import { buildSaft, type SaftInput } from "@/lib/saft";
import { buildEhf, ehfErrors, unitCode } from "@/lib/ehf";
import { calculate, toJournalEntry, type InvoiceInput } from "@/lib/invoice";
import { buildReceiptEntry } from "@/lib/receipt/booking";
import { amount, el } from "@/lib/xml";

const seller = {
  name: "Test & Sønn AS", orgNo: "999888777", address: "Gate 1", postalCode: "0150", city: "Oslo",
  vatRegistered: true, inBusinessRegister: true, bankAccount: "12345678903",
};
const invoice: InvoiceInput = {
  kind: "invoice", number: 7, issueDate: "2026-03-10", dueDate: "2026-03-24", deliveryDate: "2026-03-10",
  seller, buyer: { name: "Kunde AS", orgNo: "987654321", address: "Vei 2", postalCode: "5003", city: "Bergen" },
  lines: [
    { description: "Rådgivning", quantity: 2, unitPriceOre: 100000, vatCategory: "high", unit: "timer" },
    { description: "Bok", quantity: 1, unitPriceOre: 20000, vatCategory: "zero" },
  ],
  kid: "000010000079",
};

describe("xml", () => {
  it("formaterer beløp og escaper tekst", () => {
    expect(amount(123456)).toBe("1234.56");
    expect(amount(-5)).toBe("-0.05");
    expect(el("a", "x & <y>")).toBe("<a>x &amp; &lt;y&gt;</a>");
    expect(el("a", null)).toBe("");
  });
});

describe("MVA-melding", () => {
  it("summerer utgående og inngående MVA per kode", () => {
    const sale = toJournalEntry(invoice);
    const receipt = buildReceiptEntry({
      date: "2026-03-12", supplierName: "Clas Ohlson", description: "Kabler", expenseAccount: "6800",
      totalOre: 12500, paid: true, vatLines: [{ ratePercent: 25, baseOre: 10000, vatOre: 2500 }],
    }, true);
    const lines = [...sale.lines, ...receipt.lines].filter((l) => l.vatCode).map((l) => ({ account: l.account, amountOre: l.amount, vatCode: l.vatCode! }));
    const r = buildVatReport(lines);
    expect(r.lines.map((l) => [l.code, l.baseOre, l.vatOre])).toEqual([
      ["3", 200000, 50000],
      ["5", 20000, 0],
      ["1", 10000, -2500],
    ]);
    expect(r.outputOre).toBe(50000);
    expect(r.inputOre).toBe(2500);
    expect(r.payableOre).toBe(47500);
  });

  it("finner terminer, også skuddår", () => {
    expect(termPeriod(2028, "1")).toMatchObject({ from: "2028-01-01", to: "2028-02-29" });
    expect(termPeriod(2026, "6")).toMatchObject({ from: "2026-11-01", to: "2026-12-31" });
    expect(termOf("2026-11-02")).toBe("6");
    expect(termOf("2026-04-30")).toBe("2");
  });
});

describe("SAF-T", () => {
  const entry = toJournalEntry(invoice);
  const input: SaftInput = {
    company: { ...seller, contactName: "Vegard Test" },
    year: 2026, fromMonth: 1, toMonth: 12, createdDate: "2026-11-02",
    software: { company: "Regnskap", id: "regnskap", version: "0.2.0" },
    accounts: [
      { number: "1500", name: "Kundefordringer", openingOre: 0, closingOre: 270000 },
      { number: "3000", name: "Salgsinntekt", openingOre: 0, closingOre: -200000 },
    ],
    customers: [{ customerNo: 10001, name: "Kunde AS", orgNo: "987654321", address: "Vei 2", postalCode: "5003", city: "Bergen", openingOre: 0, closingOre: 270000 }],
    entries: [{
      voucherNo: 1, date: "2026-03-10", systemDate: "2026-03-10", description: entry.description,
      lines: entry.lines.map((l) => ({ account: l.account, amountOre: l.amount, vatCode: l.vatCode ?? null, description: l.description ?? null, customerNo: l.account === "1500" ? 10001 : null })),
    }],
  };
  const xml = buildSaft(input);

  it("har riktig hode og summer", () => {
    expect(xml).toContain('<AuditFile xmlns="urn:StandardAuditFile-Taxation-Financial:NO">');
    expect(xml).toContain("<AuditFileVersion>1.30</AuditFileVersion>");
    expect(xml).toContain("<Name>Test &amp; Sønn AS</Name>");
    expect(xml).toContain("<TaxRegistrationNumber>999888777MVA</TaxRegistrationNumber>");
    expect(xml).toContain("<TotalDebit>2700.00</TotalDebit><TotalCredit>2700.00</TotalCredit>");
    expect(xml).toContain("<ClosingCreditBalance>2000.00</ClosingCreditBalance>");
    expect(xml).toContain("<CustomerID>10001</CustomerID>");
    expect(xml).toContain("<FirstName>Vegard</FirstName><LastName>Test</LastName>");
  });

  it("har MVA-informasjon på linjene", () => {
    expect(xml).toMatch(/<AccountID>3000<\/AccountID><Description>[^<]*<\/Description><CreditAmount><Amount>2000.00<\/Amount><\/CreditAmount><TaxInformation><TaxType>MVA<\/TaxType><TaxCode>3<\/TaxCode><TaxPercentage>25.00<\/TaxPercentage><TaxBase>2000.00<\/TaxBase><TaxAmount><Amount>500.00<\/Amount>/);
    expect(xml).toContain("<TaxCode>5</TaxCode>");
  });
});

describe("EHF", () => {
  const totals = calculate(invoice);
  const xml = buildEhf(invoice, totals, "10001");

  it("følger Peppol BIS Billing 3.0", () => {
    expect(xml).toContain("<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>");
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(xml).toContain('<cbc:EndpointID schemeID="0192">999888777</cbc:EndpointID>');
    expect(xml).toContain("<cbc:CompanyID>NO999888777MVA</cbc:CompanyID>");
    expect(xml).toContain("<cbc:CompanyID>Foretaksregisteret</cbc:CompanyID>");
    expect(xml).toContain("<cbc:PaymentID>000010000079</cbc:PaymentID>");
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="HUR">2</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="NOK">2700.00</cbc:TaxInclusiveAmount>');
    expect(xml).toMatch(/<cbc:ID>Z<\/cbc:ID><cbc:Percent>0<\/cbc:Percent>/);
  });

  it("lager kreditnota med positive beløp og referanse", () => {
    const credit: InvoiceInput = { ...invoice, kind: "credit_note", number: 8, creditsInvoiceNumber: 7, kid: undefined };
    const x = buildEhf(credit, calculate(credit), "10001");
    expect(x).toContain("<CreditNote xmlns=\"urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2\"");
    expect(x).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(x).toContain("<cac:InvoiceDocumentReference><cbc:ID>7</cbc:ID>");
    expect(x).toContain('<cbc:PayableAmount currencyID="NOK">2700.00</cbc:PayableAmount>');
    expect(x).not.toContain("<cbc:DueDate>");
  });

  it("krever organisasjonsnummer hos kunden", () => {
    expect(ehfErrors({ ...invoice, buyer: { ...invoice.buyer, orgNo: undefined } })).toHaveLength(1);
    expect(unitCode("dag")).toBe("DAY");
    expect(unitCode("ukjent")).toBe("EA");
  });
});
