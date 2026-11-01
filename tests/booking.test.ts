import { describe, expect, it } from "vitest";
import { buildReceiptEntry, type ReceiptBooking } from "@/lib/receipt/booking";
import { parseKr, oreToInput } from "@/lib/money";

const base: ReceiptBooking = {
  date: "2026-11-01", supplierName: "Clas Ohlson", description: "Kontorrekvisita",
  expenseAccount: "6800", totalOre: 12500, paid: true,
  vatLines: [{ ratePercent: 25, baseOre: 10000, vatOre: 2500 }],
};

describe("bokføring av kvittering", () => {
  it("fører kostnad, inngående MVA og bank", () => {
    const e = buildReceiptEntry(base, true);
    expect(e.lines).toEqual([
      expect.objectContaining({ account: "6800", amount: 10000, vatCode: "1" }),
      expect.objectContaining({ account: "2710", amount: 2500, vatCode: "1" }),
      expect.objectContaining({ account: "1920", amount: -12500 }),
    ]);
  });

  it("ubetalt regning krediteres leverandørgjeld", () => {
    const e = buildReceiptEntry({ ...base, paid: false }, true);
    expect(e.lines.at(-1)).toMatchObject({ account: "2400", amount: -12500 });
  });

  it("uten MVA-registrering føres hele beløpet som kostnad", () => {
    const e = buildReceiptEntry(base, false);
    expect(e.lines[0]).toMatchObject({ account: "6800", amount: 12500 });
    expect(e.lines.some((l) => l.account === "2710")).toBe(false);
  });

  it("flere satser og øreavrunding", () => {
    const e = buildReceiptEntry({
      ...base, totalOre: 23500,
      vatLines: [{ ratePercent: 25, baseOre: 10000, vatOre: 2500 }, { ratePercent: 15, baseOre: 9565, vatOre: 1435 }],
    }, true);
    expect(e.lines.find((l) => l.description === "Øreavrunding")?.amount).toBe(0 + 23500 - 23500 || undefined);
    expect(e.lines.filter((l) => l.account === "2710").map((l) => l.vatCode)).toEqual(["1", "11"]);
    const e2 = buildReceiptEntry({ ...base, totalOre: 12540 }, true);
    expect(e2.lines.find((l) => l.description === "Øreavrunding")?.amount).toBe(40);
  });

  it("avviser feil", () => {
    expect(() => buildReceiptEntry({ ...base, totalOre: 20000 }, true)).toThrow(/stemmer ikke/);
    expect(() => buildReceiptEntry({ ...base, expenseAccount: "1920" }, true)).toThrow(/kostnadskonto/);
  });

  it("uten MVA-linjer føres totalen", () => {
    const e = buildReceiptEntry({ ...base, vatLines: [] }, true);
    expect(e.lines).toHaveLength(2);
  });
});

describe("beløp", () => {
  it("leser norske kronebeløp", () => {
    expect(parseKr("1 234,50")).toBe(123450);
    expect(parseKr("99")).toBe(9900);
    expect(parseKr("12.5")).toBe(1250);
    expect(parseKr("kr 10,05")).toBe(1005);
    expect(parseKr("abc")).toBeNull();
    expect(parseKr("1,234")).toBeNull();
    expect(oreToInput(123450)).toBe("1234,50");
    expect(oreToInput(-5)).toBe("-0,05");
  });
});
