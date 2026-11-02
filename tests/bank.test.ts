import { describe, expect, it } from "vitest";
import { parseCamt053, isCamt053 } from "@/lib/bank/camt053";
import { parseBankCsv } from "@/lib/bank/csv";
import { buildBankEntry, suggestMatches, type BankTx, type OpenInvoice, type LedgerCandidate } from "@/lib/bank/match";
import { dedupeKeys, kidFromText, normalizeAccountNo, parseAmountOre, parseBankDate, parseDecimalOre } from "@/lib/bank/statement";
import { parseXml } from "@/lib/bank/xml";
import { CAMT } from "./fixtures/camt053";


describe("beløp og datoer fra banken", () => {
  it("leser beløp uten flyttall", () => {
    expect(parseAmountOre("1 234,50")).toBe(123450);
    expect(parseAmountOre("-1.234,50")).toBe(-123450);
    expect(parseAmountOre("1,234.50")).toBe(123450);
    expect(parseAmountOre("12,5")).toBe(1250);
    expect(parseAmountOre("+99")).toBe(9900);
    expect(parseAmountOre("1.000.000")).toBe(100000000);
    expect(parseAmountOre("0,1")).toBe(10);
    expect(parseAmountOre("12,345")).toBeNull();
    expect(parseAmountOre("abc")).toBeNull();
    expect(parseDecimalOre("100.000")).toBe(10000);
    expect(parseDecimalOre("0.005")).toBeNull();
  });

  it("leser datoer i norske og ISO-formater", () => {
    expect(parseBankDate("31.10.2026")).toBe("2026-10-31");
    expect(parseBankDate("1.2.26")).toBe("2026-02-01");
    expect(parseBankDate("2026-10-31T23:59:59")).toBe("2026-10-31");
    expect(parseBankDate("31.02.2026")).toBeNull();
    expect(parseBankDate("Saldo")).toBeNull();
  });

  it("normaliserer IBAN og finner KID i tekst", () => {
    expect(normalizeAccountNo("NO93 1234 5678 903")).toBe("12345678903");
    expect(normalizeAccountNo("1234.56.78903")).toBe("12345678903");
    expect(kidFromText("Giro KID: 0001234567")).toBe("0001234567");
    expect(kidFromText("Overføring")).toBeUndefined();
  });

  it("lager like nøkler for samme transaksjon, og skiller like transaksjoner i samme fil", () => {
    const t = { bookingDate: "2026-10-01", amountOre: -5000, description: "Kaffe" };
    const [a, b] = dedupeKeys("12345678903", [t, t]);
    expect(a).not.toBe(b);
    expect(dedupeKeys("12345678903", [t])[0]).toBe(a);
    expect(dedupeKeys("1", [{ ...t, bankRef: "X" }])[0]).toBe("ref:1:X");
  });
});

describe("XML", () => {
  it("avviser DOCTYPE og ugyldig nesting", () => {
    expect(() => parseXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><a>&e;</a>')).toThrow(/DOCTYPE/);
    expect(() => parseXml("<a><b></a>")).toThrow();
    expect(parseXml("<a x='1'><![CDATA[<hei>]]></a>").text).toBe("<hei>");
  });
});

describe("CAMT.053", () => {
  it("leser konto, saldo og bokførte poster, og deler samleposter", () => {
    expect(isCamt053(CAMT)).toBe(true);
    const [s] = parseCamt053(CAMT);
    expect(s.accountNo).toBe("12345678903");
    expect(s.statementRef).toBe("STMT-2026-10");
    expect(s.fromDate).toBe("2026-10-01");
    expect(s.toDate).toBe("2026-10-31");
    expect(s.openingOre).toBe(1000000);
    expect(s.closingOre).toBe(1294000);
    expect(s.transactions).toHaveLength(4); // PDNG er utelatt
    const [a, b, fee, tel] = s.transactions;
    expect(a).toMatchObject({ amountOre: 250000, reference: "1000110", counterparty: "Kunde AS", bankRef: "A1#1" });
    expect(b).toMatchObject({ amountOre: 62500, description: "Faktura 7", counterparty: "Annen & Kunde" });
    expect(fee).toMatchObject({ amountOre: -12500, bookingDate: "2026-10-31", description: "Gebyr nettbank", bankRef: "A2" });
    expect(tel).toMatchObject({ amountOre: -6000, counterparty: "Telenor", description: "Mobil oktober" });
    const sum = s.transactions.reduce((x, t) => x + t.amountOre, 0);
    expect(s.openingOre! + sum).toBe(s.closingOre);
  });

  it("avviser andre valutaer enn NOK", () => {
    expect(() => parseCamt053(CAMT.replace("<Ccy>NOK</Ccy>", "<Ccy>EUR</Ccy>"))).toThrow(/NOK/);
  });
});

describe("CSV fra nettbank", () => {
  it("DNB-format med inn og ut i egne kolonner", () => {
    const csv = `"Dato";"Forklaring";"Rentedato";"Ut fra konto";"Inn på konto"
"01.10.2026";"Varekjøp Rema 1000";"01.10.2026";"249,90";""
"02.10.2026";"Giro KID 1000110 Kunde AS";"02.10.2026";"";"2 500,00"
`;
    const s = parseBankCsv(csv);
    expect(s.transactions).toEqual([
      expect.objectContaining({ bookingDate: "2026-10-01", amountOre: -24990, description: "Varekjøp Rema 1000" }),
      expect.objectContaining({ bookingDate: "2026-10-02", amountOre: 250000, reference: "1000110" }),
    ]);
    expect(s.fromDate).toBe("2026-10-01");
    expect(s.toDate).toBe("2026-10-02");
  });

  it("Nordea-format med beløp med fortegn og tabulator", () => {
    const csv = "Bokføringsdato\tBeløp\tAvsender\tMottaker\tNavn\tTittel\tValuta\n2026/10/05\t-1234,56\t\t\tTelenor\tMobil\tNOK\n2026/10/06\t500\t\t\tOla\tInnskudd\tNOK\n";
    const s = parseBankCsv(csv);
    expect(s.transactions.map((t) => t.amountOre)).toEqual([-123456, 50000]);
    expect(s.transactions[0]).toMatchObject({ counterparty: "Telenor", description: "Mobil", bookingDate: "2026-10-05" });
  });

  it("Sbanken-format med arkivreferanse og ekstra linjer", () => {
    const csv = `Kontoutskrift for 1234.56.78903
BOKFØRINGSDATO;RENTEDATO;ARKIVREFERANSE;MOTKONTO;TYPE;TEKST;UT FRA KONTO;INN PÅ KONTO
03.10.2026;03.10.2026;8817;;VARE;"Kiwi; Oslo";-89,00;
Saldo;;;;;;;
`;
    const s = parseBankCsv(csv);
    expect(s.transactions).toHaveLength(1);
    expect(s.transactions[0]).toMatchObject({ amountOre: -8900, bankRef: "8817", description: "VARE Kiwi; Oslo" });
  });

  it("gir forståelig feil når kolonnene ikke finnes", () => {
    expect(() => parseBankCsv("a;b;c\n1;2;3\n")).toThrow(/Fant ikke kolonner/);
  });
});

describe("avstemmingsforslag", () => {
  const invoices: OpenInvoice[] = [
    { id: 1, number: 1, kid: "1000110", openOre: 250000, customerName: "Kunde AS" },
    { id: 2, number: 7, kid: "1000727", openOre: 62500, customerName: "Annen Kunde" },
    { id: 3, number: 8, kid: "1000735", openOre: 99900, customerName: "Tredje AS" },
  ];
  const entries: LedgerCandidate[] = [
    { entryId: "50", voucherNo: 5, date: "2026-10-19", amountOre: -6000, description: "Telenor mobil" },
    { entryId: "51", voucherNo: 6, date: "2026-10-01", amountOre: -12500, description: "Gebyr" },
  ];
  const tx = (id: string, date: string, amountOre: number, description: string, reference?: string): BankTx =>
    ({ id, date, amountOre, description, reference });

  it("finner faktura på KID, fakturanummer og bilag med samme beløp", () => {
    const m = suggestMatches(
      [
        tx("a", "2026-10-10", 250000, "Kunde AS", "1000110"),
        tx("b", "2026-10-10", 62500, "Faktura 7"),
        tx("c", "2026-10-20", -6000, "Telenor"),
        tx("d", "2026-10-31", -12500, "Gebyr"),
        tx("e", "2026-10-31", -777, "Ukjent"),
      ],
      invoices,
      entries,
    );
    expect(m.get("a")).toMatchObject({ kind: "invoice", invoiceId: 1, confidence: "sikker" });
    expect(m.get("b")).toMatchObject({ kind: "invoice", invoiceId: 2, confidence: "sikker" });
    expect(m.get("c")).toMatchObject({ kind: "entry", entryId: "50", confidence: "sikker" });
    expect(m.has("d")).toBe(false); // 30 dager unna
    expect(m.has("e")).toBe(false);
  });

  it("delbetaling med KID er sannsynlig, ikke sikker", () => {
    const m = suggestMatches([tx("a", "2026-10-10", 100000, "Innbetaling", "1000110")], invoices, []);
    expect(m.get("a")).toMatchObject({ kind: "invoice", invoiceId: 1, confidence: "sannsynlig", amountOre: 100000 });
  });

  it("bruker hver faktura bare én gang, og nedgraderer tvetydige treff", () => {
    const m = suggestMatches(
      [tx("a", "2026-10-10", 99900, "Overføring"), tx("b", "2026-10-11", 99900, "Overføring")],
      invoices,
      [],
    );
    const picked = [...m.values()];
    expect(picked).toHaveLength(1);
    expect(picked[0].confidence).toBe("mulig");

    const twoEntries = suggestMatches(
      [tx("x", "2026-10-10", -5000, "Kaffe")],
      [],
      [
        { entryId: "1", voucherNo: 1, date: "2026-10-10", amountOre: -5000, description: "a" },
        { entryId: "2", voucherNo: 2, date: "2026-10-10", amountOre: -5000, description: "b" },
      ],
    );
    expect(twoEntries.get("x")?.confidence).toBe("mulig");
  });

  it("lager postering for banklinje med MVA", () => {
    const e = buildBankEntry(
      { date: "2026-10-20", amountOre: -12500, account: "6900", vatCategory: "high", description: "Telenor", documentRef: "bank:A3" },
      true,
    );
    expect(e.lines).toEqual([
      { account: "1920", amount: -12500, description: undefined },
      expect.objectContaining({ account: "6900", amount: 10000, vatCode: "1" }),
      expect.objectContaining({ account: "2710", amount: 2500 }),
    ]);
    const inn = buildBankEntry({ date: "2026-10-20", amountOre: 50000, account: "2050", description: "Innskudd", documentRef: "bank:1" }, true);
    expect(inn.lines.map((l) => [l.account, l.amount])).toEqual([["1920", 50000], ["2050", -50000]]);
    expect(() => buildBankEntry({ date: "2026-10-20", amountOre: 1, account: "1920", description: "x", documentRef: "x" }, true)).toThrow();
  });
});
