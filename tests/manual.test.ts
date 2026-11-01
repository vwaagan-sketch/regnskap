import { describe, expect, it } from "vitest";
import { buildManualEntry, splitGross } from "@/lib/manual-entry";

describe("manuelt bilag", () => {
  it("fri postering uten MVA", () => {
    const e = buildManualEntry({
      date: "2026-11-01", description: "Innskudd aksjekapital",
      lines: [
        { account: "1920", debitOre: 3000000, creditOre: 0 },
        { account: "2000", debitOre: 0, creditOre: 3000000 },
      ],
    }, true);
    expect(e.lines).toEqual([
      expect.objectContaining({ account: "1920", amount: 3000000 }),
      expect.objectContaining({ account: "2000", amount: -3000000 }),
    ]);
  });

  it("deler kostnad inkl. MVA i netto og inngående MVA", () => {
    const e = buildManualEntry({
      date: "2026-11-01", description: "Mobilabonnement",
      lines: [
        { account: "6900", debitOre: 49900, creditOre: 0, vatCategory: "high" },
        { account: "1920", debitOre: 0, creditOre: 49900 },
      ],
    }, true);
    expect(e.lines.map((l) => [l.account, l.amount, l.vatCode])).toEqual([
      ["6900", 39920, "1"], ["2710", 9980, "1"], ["1920", -49900, undefined],
    ]);
  });

  it("inntekt med MVA gir utgående MVA", () => {
    const e = buildManualEntry({
      date: "2026-11-01", description: "Kontantsalg",
      lines: [
        { account: "1900", debitOre: 11500, creditOre: 0 },
        { account: "3000", debitOre: 0, creditOre: 11500, vatCategory: "medium" },
      ],
    }, true);
    expect(e.lines.find((l) => l.account === "2701")).toMatchObject({ amount: -1500, vatCode: "31" });
    expect(e.lines.find((l) => l.account === "3000")).toMatchObject({ amount: -10000, vatCode: "31" });
  });

  it("avviser ubalansert bilag og linjer med både debet og kredit", () => {
    expect(() => buildManualEntry({ date: "2026-11-01", description: "x", lines: [
      { account: "1920", debitOre: 100, creditOre: 0 }, { account: "3000", debitOre: 0, creditOre: 90 }] }, true)).toThrow(/balanserer ikke/);
    expect(() => buildManualEntry({ date: "2026-11-01", description: "x", lines: [
      { account: "1920", debitOre: 100, creditOre: 100 }, { account: "3000", debitOre: 0, creditOre: 0 }] }, true)).toThrow(/enten debet eller kredit/);
    expect(() => buildManualEntry({ date: "2026-11-01", description: "x", lines: [
      { account: "1920", debitOre: 100, creditOre: 0, vatCategory: "high" }, { account: "2000", debitOre: 0, creditOre: 100 }] }, true)).toThrow(/MVA kan bare/);
  });

  it("splitter brutto riktig", () => {
    expect(splitGross(12500, "high")).toEqual({ net: 10000, vat: 2500 });
    expect(splitGross(-11200, "low")).toEqual({ net: -10000, vat: -1200 });
  });
});
