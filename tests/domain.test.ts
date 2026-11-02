import { describe, expect, it } from "vitest";
import { calculate, toJournalEntry, validateInvoice, sellerIdLine, type InvoiceInput } from "@/lib/invoice";
import { validateEntry, reverseEntry, trialBalance, LedgerError } from "@/lib/ledger";
import { makeKid, isValidKid, mod10CheckDigit } from "@/lib/kid";
import { checkReceipt, type ReceiptData } from "@/lib/receipt/scan";

const seller = {
  name: "Waagan AS", orgNo: "123456789", address: "Storgata 1", postalCode: "0155", city: "Oslo",
  vatRegistered: true, inBusinessRegister: true, bankAccount: "12345678903",
};
const base: InvoiceInput = {
  kind: "invoice", number: 1, issueDate: "2026-11-01", dueDate: "2026-11-15", deliveryDate: "2026-10-31",
  seller,
  buyer: { name: "Kunde AS", orgNo: "987654321", address: "Vei 2", postalCode: "5003", city: "Bergen" },
  lines: [
    { description: "Konsulenttimer", quantity: 1.5, unitPriceOre: 100000, vatCategory: "high" },
    { description: "Lunsj", quantity: 2, unitPriceOre: 9950, vatCategory: "medium" },
  ],
};

describe("faktura", () => {
  it("beregner netto, MVA per sats og brutto i øre", () => {
    const t = calculate(base);
    expect(t.netOre).toBe(150000 + 19900);
    expect(t.vatByCategory.high).toEqual({ baseOre: 150000, vatOre: 37500 });
    expect(t.vatByCategory.medium).toEqual({ baseOre: 19900, vatOre: 2985 });
    expect(t.grossOre).toBe(169900 + 37500 + 2985);
  });

  it("gir balansert postering med riktige konti", () => {
    const e = toJournalEntry(base);
    expect(e.lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
    expect(e.lines.find((l) => l.account === "1500")?.amount).toBe(210385);
    expect(e.lines.find((l) => l.account === "2700")?.amount).toBe(-37500);
    expect(e.lines.find((l) => l.account === "2701")?.amount).toBe(-2985);
  });

  it("kreditnota reverserer fortegn", () => {
    const e = toJournalEntry({ ...base, kind: "credit_note", number: 2, creditsInvoiceNumber: 1 });
    expect(e.lines.find((l) => l.account === "1500")?.amount).toBe(-210385);
  });

  it("selger uten MVA-registrering fakturerer uten MVA", () => {
    const t = calculate({ ...base, seller: { ...seller, vatRegistered: false } });
    expect(t.vatOre).toBe(0);
  });

  it("finner manglende pliktige opplysninger", () => {
    const errs = validateInvoice({ ...base, buyer: { ...base.buyer, address: "" }, lines: [] });
    expect(errs).toContain("Mangler kjøpers navn eller adresse");
    expect(errs).toContain("Fakturaen har ingen linjer");
    expect(validateInvoice(base)).toEqual([]);
    expect(validateInvoice({ ...base, kind: "credit_note" })).toContain("Kreditnota må vise til fakturaen som krediteres");
  });

  it("viser org.nr med MVA og Foretaksregisteret", () => {
    expect(sellerIdLine(seller)).toBe("Org.nr. 123 456 789 MVA Foretaksregisteret");
  });
});

describe("hovedbok", () => {
  it("avviser ubalanserte posteringer", () => {
    expect(() =>
      validateEntry({ date: "2026-11-01", description: "x", documentRef: "d", lines: [
        { account: "1920", amount: 100 }, { account: "3000", amount: -99 }] }),
    ).toThrow(LedgerError);
  });
  it("reversering nuller saldo", () => {
    const e = toJournalEntry(base);
    const tb = trialBalance([e, reverseEntry(e, "2026-11-02", "rev:1")]);
    for (const v of tb.values()) expect(v).toBe(0);
  });
});

describe("KID", () => {
  it("MOD10 kontrollsiffer", () => {
    expect(mod10CheckDigit("7992739871")).toBe("3");
    const kid = makeKid(12, 345);
    expect(kid).toHaveLength(13);
    expect(isValidKid(kid)).toBe(true);
    expect(isValidKid(kid.slice(0, -1) + ((Number(kid.at(-1)) + 1) % 10))).toBe(false);
  });
});

describe("kvitteringskontroll", () => {
  const r: ReceiptData = {
    documentType: "receipt", supplierName: "Butikk", supplierOrgNo: "123456789", documentNumber: null,
    issueDate: "2026-11-01", dueDate: null, currency: "NOK", totalInclVatOre: 12500,
    vatLines: [{ ratePercent: 25, baseOre: 10000, vatOre: 2500 }], kid: null, bankAccount: null,
    suggestedAccount: "6800", description: "Kontorrekvisita", confidence: "high", notes: null,
  };
  it("godtar konsistent kvittering", () => expect(checkReceipt(r)).toEqual([]));
  it("varsler ved feil sum og MVA", () => {
    const w = checkReceipt({ ...r, totalInclVatOre: 13000, vatLines: [{ ratePercent: 25, baseOre: 10000, vatOre: 2000 }] });
    expect(w.length).toBe(2);
  });
});

describe("faktura med egne inntektskonti", () => {
  it("fører inntekt på varens konto og MVA per sats", () => {
    const e = toJournalEntry({
      ...base,
      lines: [
        { description: "Vare A", quantity: 1, unitPriceOre: 10000, vatCategory: "high", account: "3010" },
        { description: "Vare B", quantity: 1, unitPriceOre: 20000, vatCategory: "high" },
      ],
    });
    expect(e.lines.find((l) => l.account === "3010")?.amount).toBe(-10000);
    expect(e.lines.find((l) => l.account === "3000")?.amount).toBe(-20000);
    expect(e.lines.find((l) => l.account === "2700")?.amount).toBe(-7500);
    expect(validateInvoice({ ...base, lines: [{ ...base.lines[0], account: "1920" }] })).toContain("Linje 1: inntektskonto må være i 3000-serien");
  });
});
