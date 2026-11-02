import { describe, expect, it } from "vitest";
import {
  aMeldingDeadline, birthDateFromNationalId, calculatePayslip, holidayExtraEligible, isValidNationalId, paymentTerm,
  percentTax, toPayoutEntry, toPayrollEntry, validateEmployee, type EmployeeInput,
} from "@/lib/payroll";
import { buildAMeldingXml, type AMeldingInput } from "@/lib/a-melding";
import { trialBalance } from "@/lib/ledger";

const base = { agaRateBp: 1410, holidayRateBp: 1020 };

describe("lønnsberegning", () => {
  it("beregner fastlønn med prosenttrekk, AGA og feriepenger", () => {
    const p = calculatePayslip({
      ...base,
      lines: [{ type: "fastloenn", quantity: 1, rateOre: 5_000_000 }],
      tax: { mode: "percent", percent: 33 },
    });
    expect(p.grossOre).toBe(5_000_000);
    expect(p.taxOre).toBe(1_650_000);
    expect(p.netOre).toBe(3_350_000);
    expect(p.agaSalaryOre).toBe(705_000);
    expect(p.holidayBasisOre).toBe(5_000_000);
    expect(p.holidayPayOre).toBe(510_000);
    expect(p.holidayAgaOre).toBe(71_910);
  });

  it("runder forskuddstrekket ned til hele kroner", () => {
    expect(percentTax(1_234_567, 31)).toBe(382_700); // 3827,15 kr -> 3827 kr
    expect(percentTax(-1_234_567, 31)).toBe(-382_700);
    expect(percentTax(0, 31)).toBe(0);
  });

  it("utbetalte feriepenger gir ikke nye feriepenger, og trekk for ferie reduserer brutto", () => {
    const p = calculatePayslip({
      ...base,
      lines: [
        { type: "fastloenn", quantity: 1, rateOre: 5_000_000 },
        { type: "trekkFerie", quantity: 1, rateOre: 5_000_000 },
        { type: "feriepenger", quantity: 1, rateOre: 6_120_000 },
      ],
      tax: { mode: "manual", amountOre: 0 },
    });
    expect(p.grossOre).toBe(6_120_000);
    expect(p.holidayBasisOre).toBe(5_000_000);
    expect(p.agaBasisSalaryOre).toBe(0);
    expect(p.agaBasisHolidayOre).toBe(6_120_000);
  });

  it("gir tillegg på 2,3 % for over 60 år, begrenset til 6G", () => {
    const p = calculatePayslip({
      ...base,
      lines: [{ type: "timeloenn", quantity: 100, rateOre: 30_000 }],
      tax: { mode: "percent", percent: 0 },
      holidayExtra: { eligible: true, capRemainingOre: 1_000_000 },
    });
    expect(p.holidayPayOre).toBe(306_000 + 23_000);
  });

  it("avviser manuelt trekk større enn brutto og lønnsslipp uten linjer", () => {
    expect(() => calculatePayslip({ ...base, lines: [{ type: "bonus", quantity: 1, rateOre: 1000 }], tax: { mode: "manual", amountOre: 2000 } })).toThrow();
    expect(() => calculatePayslip({ ...base, lines: [], tax: { mode: "percent", percent: 30 } })).toThrow(/ingen linjer/);
  });
});

describe("postering av lønn", () => {
  it("balanserer og fører lønn, trekk, AGA og feriepenger på riktige kontoer", () => {
    const p = calculatePayslip({ ...base, lines: [{ type: "fastloenn", quantity: 1, rateOre: 5_000_000 }], tax: { mode: "percent", percent: 33 } });
    const entry = toPayrollEntry({ runNo: 1, payDate: "2026-11-20", description: "Lønn november" }, [p]);
    const payout = toPayoutEntry({ runNo: 1, netOre: p.netOre, taxOre: p.taxOre }, "2026-11-20", true);
    const tb = trialBalance([entry, payout]);
    expect(tb.get("5000")).toBe(5_000_000);
    expect(tb.get("2600")).toBe(-1_650_000);
    expect(tb.get("2930")).toBe(0);
    expect(tb.get("1950")).toBe(1_650_000);
    expect(tb.get("1920")).toBe(-5_000_000);
    expect(tb.get("5400")).toBe(705_000);
    expect(tb.get("2770")).toBe(-705_000);
    expect(tb.get("5180")).toBe(510_000);
    expect(tb.get("2940")).toBe(-510_000);
    expect(tb.get("5405")).toBe(71_910);
    expect(tb.get("2785")).toBe(-71_910);
  });

  it("utbetalte feriepenger belaster skyldig feriepenger og flytter avsatt AGA til skyldig AGA", () => {
    const p = calculatePayslip({ ...base, lines: [{ type: "feriepenger", quantity: 1, rateOre: 510_000 }], tax: { mode: "manual", amountOre: 0 } });
    const tb = trialBalance([toPayrollEntry({ runNo: 2, payDate: "2027-06-15", description: "Feriepenger" }, [p])]);
    expect(tb.get("2940")).toBe(510_000);
    expect(tb.get("2785")).toBe(71_910);
    expect(tb.get("2770")).toBe(-71_910);
    expect(tb.get("5000")).toBeUndefined();
  });
});

describe("frister og fødselsnummer", () => {
  it("regner frister for a-melding og terminer", () => {
    expect(aMeldingDeadline("2026-11")).toBe("2026-12-05");
    expect(aMeldingDeadline("2026-12")).toBe("2027-01-05");
    expect(paymentTerm("2026-11").deadline).toBe("2027-01-15");
    expect(paymentTerm("2026-03")).toMatchObject({ term: 2, deadline: "2026-05-15" });
  });

  it("kontrollerer fødselsnummer og finner fødselsdato", () => {
    expect(isValidNationalId("15058510170")).toBe(true);
    expect(isValidNationalId("15058510171")).toBe(false);
    expect(birthDateFromNationalId("15058510170")).toBe("1985-05-15");
    expect(birthDateFromNationalId("24030250024")).toBe("2002-03-24");
    expect(holidayExtraEligible("1960-01-01", 2026)).toBe(true);
    expect(holidayExtraEligible("1985-05-15", 2026)).toBe(false);
  });

  it("validerer ansatt", () => {
    const e: EmployeeInput = {
      name: "Kari Nordmann", national_id: "15058510170", email: null, address: "Gate 1", postal_code: "0150", city: "Oslo",
      bank_account: null, employment_id: "1", start_date: "2026-01-01", end_date: null, occupation_code: "2511101",
      position_pct: 100, hours_per_week: 37.5, pay_type: "fast", monthly_salary_ore: 5_000_000, hourly_rate_ore: null, tax_percent: 33,
    };
    expect(validateEmployee(e)).toEqual([]);
    expect(validateEmployee({ ...e, occupation_code: "12", monthly_salary_ore: null })).toHaveLength(2);
  });
});

describe("a-melding", () => {
  const input: AMeldingInput = {
    period: "2026-11", meldingsId: "11111111-2222-3333-4444-555555555555", createdAt: "2026-11-20T12:00:00",
    orgNo: "999888777", businessUnitOrgNo: "999888666", agaZone: "1", agaBasisOre: 5_000_000,
    employees: [{
      nationalId: "15058510170", name: "Kari & Nordmann", employmentId: "1", startDate: "2026-01-01", endDate: null,
      occupationCode: "2511101", positionPct: 100, hoursPerWeek: 37.5, payType: "fast",
      income: { fastloenn: 5_000_000 }, taxOre: 1_650_000,
    }],
  };

  it("lager XML med summer, inntekt og arbeidsgiveravgift", () => {
    const xml = buildAMeldingXml(input);
    expect(xml).toContain("<kalendermaaned>2026-11</kalendermaaned>");
    expect(xml).toContain("<sumForskuddstrekk>-16500.00</sumForskuddstrekk>");
    expect(xml).toContain("<sumArbeidsgiveravgift>7050.00</sumArbeidsgiveravgift>");
    expect(xml).toContain("<beskrivelse>fastloenn</beskrivelse>");
    expect(xml).toContain("<navn>Kari &amp; Nordmann</navn>");
    expect(xml).toContain("<foedselsdato>1985-05-15</foedselsdato>");
    expect(xml).toContain("<prosentsatsForAvgiftsberegning>14.1</prosentsatsForAvgiftsberegning>");
  });

  it("krever virksomhetsnummer", () => {
    expect(() => buildAMeldingXml({ ...input, businessUnitOrgNo: "" })).toThrow(/underenheten/);
  });
});
