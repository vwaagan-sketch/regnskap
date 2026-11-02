import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import type { CompanyRow } from "@/db/company-repo";
import { trialBalanceForYear } from "@/db/ledger-repo";
import {
  createAMelding, createEmployee, createRun, getAMelding, getRun, holidayPaySummary, listRuns, registerPayout, reverseRun,
  savePayrollSettings,
} from "@/db/payroll-repo";
import { ACCOUNT_NAMES } from "@/lib/accounts";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("lønn mot database", () => {
  const sql = postgres(url ?? "", { onnotice: () => {} });
  let company: CompanyRow;
  let empId = 0;

  beforeAll(async () => {
    const orgNo = String(100000000 + Math.floor(Math.random() * 899999999));
    [company] = await sql<CompanyRow[]>`
      INSERT INTO company (name, org_no, address, postal_code, city, bank_account)
      VALUES ('Lønn AS', ${orgNo}, 'Gate 1', '0150', 'Oslo', '12345678903') RETURNING *`;
    for (const [no, name] of Object.entries(ACCOUNT_NAMES)) {
      await sql`INSERT INTO account (company_id, number, name) VALUES (${company.id}, ${no}, ${name})`;
    }
    await savePayrollSettings(sql, company.id, { business_unit_org_no: "999888666", aga_zone: "1", holiday_pay_rate_bp: 1020 });
    empId = await createEmployee(sql, company.id, {
      name: "Kari Nordmann", national_id: "15058510170", email: null, address: "Gate 1", postal_code: "0150", city: "Oslo",
      bank_account: null, employment_id: "1", start_date: "2026-01-01", end_date: null, occupation_code: "2511101",
      position_pct: 100, hours_per_week: 37.5, pay_type: "fast", monthly_salary_ore: 5_000_000, hourly_rate_ore: null, tax_percent: 33,
    });
  });
  afterAll(() => sql.end());

  it("godkjenner lønnskjøring, utbetaler, reverserer og lager a-melding", async () => {
    const run = await createRun(sql, company, {
      payDate: "2026-11-20", description: "Lønn november",
      slips: [{ employeeId: empId, lines: [{ type: "fastloenn", quantity: 1, rateOre: 5_000_000 }] }],
    });
    const detail = await getRun(sql, company.id, run.id);
    expect(detail?.slips).toHaveLength(1);
    expect(Number(detail?.slips[0].net_ore)).toBe(3_350_000);
    expect(Number(detail?.slips[0].ytd.gross_ore)).toBe(5_000_000);

    await registerPayout(sql, company.id, run.id, "2026-11-20", true);
    await expect(registerPayout(sql, company.id, run.id, "2026-11-20", true)).rejects.toThrow(/allerede/);
    await expect(reverseRun(sql, company.id, run.id, "2026-11-21")).rejects.toThrow(/utbetalt/);

    const wrong = await createRun(sql, company, {
      payDate: "2026-11-25", description: "Feil bonus",
      slips: [{ employeeId: empId, lines: [{ type: "bonus", quantity: 1, rateOre: 1_000_000 }], manualTaxOre: 400_000 }],
    });
    const rev = await reverseRun(sql, company.id, wrong.id, "2026-11-26");
    await expect(reverseRun(sql, company.id, wrong.id, "2026-11-26")).rejects.toThrow(/allerede/);
    const runs = await listRuns(sql, company.id);
    expect(runs.find((r) => r.id === wrong.id)?.reversed_by).toBe(rev.runNo);

    const tb = Object.fromEntries((await trialBalanceForYear(sql, company.id, 2026)).map((r) => [r.account, Number(r.balance_ore)]));
    expect(tb["5000"]).toBe(5_000_000);
    expect(tb["2600"]).toBe(-1_650_000);
    expect(tb["2930"]).toBe(0);
    expect(tb["2770"]).toBe(-705_000);
    expect(tb["2940"]).toBe(-510_000);

    const hp = await holidayPaySummary(sql, company.id, 2026);
    expect(Number(hp[0].holiday_pay_ore)).toBe(510_000);

    const a = await createAMelding(sql, company, "2026-11");
    expect(a.sumTaxOre).toBe(1_650_000);
    expect(a.sumAgaOre).toBe(705_000);
    const b = await createAMelding(sql, company, "2026-11");
    const xml = (await getAMelding(sql, company.id, b.id))!.xml;
    expect(xml).toContain(`<erstatterMeldingsId>${a.meldingsId}</erstatterMeldingsId>`);
    expect(xml).toContain("<beloep>50000.00</beloep>");
    expect(xml).not.toContain("<beskrivelse>bonus</beskrivelse>");

    await expect(sql`UPDATE payroll_run SET net_ore = 0 WHERE id = ${run.id}`).rejects.toThrow(/uforanderlig/);
  });
});
