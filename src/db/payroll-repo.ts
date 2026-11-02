import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { buildAMeldingXml, aMeldingSummary, type AMeldingEmployee, type AMeldingInput } from "@/lib/a-melding";
import { reverseEntry, type JournalEntryDraft } from "@/lib/ledger";
import {
  AGA_RATES_BP, PAY_ITEMS, birthDateFromNationalId, calculatePayslip, grunnbeloep, holidayExtraEligible, isActiveIn, periodOf,
  sumPayslips, toPayoutEntry, toPayrollEntry, validateEmployee,
  type AgaZone, type CalculatedPayslip, type EmployeeInput, type PayItemType, type PayLineInput, type TaxInput,
} from "@/lib/payroll";
import type { CompanyRow } from "./company-repo";
import { insertEntry } from "./ledger-repo";

type Sql = postgres.Sql | postgres.TransactionSql;

// ---------- Innstillinger ----------

export interface PayrollSettings {
  business_unit_org_no: string;
  aga_zone: AgaZone;
  holiday_pay_rate_bp: number;
}

export async function getPayrollSettings(sql: Sql, companyId: number): Promise<PayrollSettings | null> {
  const [row] = await sql<PayrollSettings[]>`
    SELECT business_unit_org_no, aga_zone, holiday_pay_rate_bp FROM payroll_settings WHERE company_id = ${companyId}`;
  return row ?? null;
}

export function validatePayrollSettings(s: PayrollSettings): string[] {
  const e: string[] = [];
  if (!/^\d{9}$/.test(s.business_unit_org_no)) e.push("Organisasjonsnummeret til virksomheten (underenheten) må ha 9 siffer");
  if (!(s.aga_zone in AGA_RATES_BP)) e.push("Velg sone for arbeidsgiveravgift");
  if (![1020, 1200].includes(s.holiday_pay_rate_bp)) e.push("Feriepengesats må være 10,2 % eller 12 %");
  return e;
}

export async function savePayrollSettings(sql: postgres.Sql, companyId: number, s: PayrollSettings) {
  const errors = validatePayrollSettings(s);
  if (errors.length) throw new Error(errors.join(". "));
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO payroll_settings (company_id, business_unit_org_no, aga_zone, holiday_pay_rate_bp)
      VALUES (${companyId}, ${s.business_unit_org_no}, ${s.aga_zone}, ${s.holiday_pay_rate_bp})
      ON CONFLICT (company_id) DO UPDATE SET business_unit_org_no = EXCLUDED.business_unit_org_no,
        aga_zone = EXCLUDED.aga_zone, holiday_pay_rate_bp = EXCLUDED.holiday_pay_rate_bp, updated_at = now()`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, 'bruker', 'save', 'payroll_settings', ${String(companyId)}, ${tx.json(s as never)})`;
  });
}

// ---------- Ansatte ----------

export interface EmployeeRow extends EmployeeInput {
  id: number;
  employee_no: number;
}

const employeeCols = (sql: Sql) => sql`
  id, employee_no, name, national_id, email, address, postal_code, city, bank_account, employment_id,
  to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
  occupation_code, position_pct::float8 AS position_pct, hours_per_week::float8 AS hours_per_week, pay_type,
  monthly_salary_ore::float8 AS monthly_salary_ore, hourly_rate_ore::float8 AS hourly_rate_ore, tax_percent`;

export async function listEmployees(sql: Sql, companyId: number): Promise<EmployeeRow[]> {
  return sql<EmployeeRow[]>`SELECT ${employeeCols(sql)} FROM employee WHERE company_id = ${companyId} ORDER BY employee_no`;
}

export async function getEmployee(sql: Sql, companyId: number, id: number): Promise<EmployeeRow | null> {
  const [row] = await sql<EmployeeRow[]>`SELECT ${employeeCols(sql)} FROM employee WHERE company_id = ${companyId} AND id = ${id}`;
  return row ?? null;
}

function normalizeEmployee(e: EmployeeInput): EmployeeInput {
  return {
    ...e,
    monthly_salary_ore: e.pay_type === "fast" ? e.monthly_salary_ore : null,
    hourly_rate_ore: e.pay_type === "time" ? e.hourly_rate_ore : e.hourly_rate_ore || null,
  };
}

export async function createEmployee(sql: postgres.Sql, companyId: number, input: EmployeeInput): Promise<number> {
  const errors = validateEmployee(input);
  if (errors.length) throw new Error(errors.join(". "));
  const e = normalizeEmployee(input);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${companyId}, 4)`;
    const dup = await tx`SELECT 1 FROM employee WHERE company_id = ${companyId} AND national_id = ${e.national_id}`;
    if (dup.length) throw new Error("Det finnes allerede en ansatt med dette fødselsnummeret");
    const [{ next }] = await tx<{ next: number }[]>`
      SELECT coalesce(max(employee_no), 0) + 1 AS next FROM employee WHERE company_id = ${companyId}`;
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO employee (company_id, employee_no, name, national_id, email, address, postal_code, city, bank_account,
        employment_id, start_date, end_date, occupation_code, position_pct, hours_per_week, pay_type,
        monthly_salary_ore, hourly_rate_ore, tax_percent)
      VALUES (${companyId}, ${next}, ${e.name}, ${e.national_id}, ${e.email}, ${e.address}, ${e.postal_code}, ${e.city},
        ${e.bank_account}, ${e.employment_id}, ${e.start_date}, ${e.end_date}, ${e.occupation_code}, ${e.position_pct},
        ${e.hours_per_week}, ${e.pay_type}, ${e.monthly_salary_ore}, ${e.hourly_rate_ore}, ${e.tax_percent})
      RETURNING id`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, 'bruker', 'create', 'employee', ${String(row.id)}, ${tx.json(e as never)})`;
    return row.id;
  }) as Promise<number>;
}

export async function updateEmployee(sql: postgres.Sql, companyId: number, id: number, input: EmployeeInput) {
  const errors = validateEmployee(input);
  if (errors.length) throw new Error(errors.join(". "));
  const e = normalizeEmployee(input);
  await sql.begin(async (tx) => {
    const dup = await tx`SELECT 1 FROM employee WHERE company_id = ${companyId} AND national_id = ${e.national_id} AND id <> ${id}`;
    if (dup.length) throw new Error("Det finnes allerede en ansatt med dette fødselsnummeret");
    const rows = await tx`
      UPDATE employee SET name = ${e.name}, national_id = ${e.national_id}, email = ${e.email}, address = ${e.address},
        postal_code = ${e.postal_code}, city = ${e.city}, bank_account = ${e.bank_account}, employment_id = ${e.employment_id},
        start_date = ${e.start_date}, end_date = ${e.end_date}, occupation_code = ${e.occupation_code},
        position_pct = ${e.position_pct}, hours_per_week = ${e.hours_per_week}, pay_type = ${e.pay_type},
        monthly_salary_ore = ${e.monthly_salary_ore}, hourly_rate_ore = ${e.hourly_rate_ore}, tax_percent = ${e.tax_percent}
      WHERE company_id = ${companyId} AND id = ${id} RETURNING id`;
    if (!rows.length) throw new Error("Fant ikke den ansatte");
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, 'bruker', 'update', 'employee', ${String(id)}, ${tx.json(e as never)})`;
  });
}

// ---------- Lønnskjøring ----------

export interface RunSlipInput {
  employeeId: number;
  lines: PayLineInput[];
  /** Manuelt forskuddstrekk i øre (tabelltrekk). Ellers brukes trekkprosenten på den ansatte. */
  manualTaxOre?: number | null;
}

export interface RunInput {
  payDate: string;
  description: string;
  slips: RunSlipInput[];
}

export interface PreviewSlip {
  employeeId: number;
  employeeName: string;
  tax: TaxInput;
  calc: CalculatedPayslip;
}

/** Feriepengegrunnlag hittil i året, for taket på 6G for tillegget over 60 år. */
async function holidayBasisYtd(sql: Sql, companyId: number, year: number): Promise<Map<number, number>> {
  const rows = await sql<{ employee_id: number; basis: string }[]>`
    SELECT p.employee_id, sum(p.holiday_basis_ore)::text AS basis
    FROM payslip p JOIN payroll_run r ON r.id = p.run_id
    WHERE r.company_id = ${companyId} AND r.pay_date >= make_date(${year}, 1, 1) AND r.pay_date < make_date(${year + 1}, 1, 1)
    GROUP BY p.employee_id`;
  return new Map(rows.map((r) => [r.employee_id, Number(r.basis)]));
}

/** Beregner lønnsslippene uten å lagre noe. */
export async function previewRun(sql: Sql, companyId: number, input: RunInput): Promise<PreviewSlip[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payDate)) throw new Error("Velg utbetalingsdato");
  const settings = await getPayrollSettings(sql, companyId);
  if (!settings) throw new Error("Fyll ut lønnsinnstillingene først (Lønn → Innstillinger)");
  const slips = input.slips.filter((s) => s.lines.length > 0);
  if (slips.length === 0) throw new Error("Lønnskjøringen har ingen ansatte med lønnslinjer");
  const ids = new Set<number>();
  const employees = new Map((await listEmployees(sql, companyId)).map((e) => [e.id, e]));
  const year = Number(input.payDate.slice(0, 4));
  const ytd = await holidayBasisYtd(sql, companyId, year);
  const sixG = 6 * grunnbeloep(input.payDate);
  const agaRateBp = AGA_RATES_BP[settings.aga_zone];
  return slips.map((s) => {
    const emp = employees.get(s.employeeId);
    if (!emp) throw new Error("Fant ikke den ansatte");
    if (ids.has(s.employeeId)) throw new Error(`${emp.name} står to ganger i kjøringen`);
    ids.add(s.employeeId);
    const tax: TaxInput = s.manualTaxOre != null ? { mode: "manual", amountOre: s.manualTaxOre } : { mode: "percent", percent: emp.tax_percent };
    const birth = birthDateFromNationalId(emp.national_id);
    try {
      const calc = calculatePayslip({
        lines: s.lines,
        tax,
        agaRateBp,
        holidayRateBp: settings.holiday_pay_rate_bp,
        holidayExtra: { eligible: !!birth && holidayExtraEligible(birth, year), capRemainingOre: sixG - (ytd.get(emp.id) ?? 0) },
      });
      return { employeeId: emp.id, employeeName: emp.name, tax, calc };
    } catch (e) {
      throw new Error(`${emp.name}: ${(e as Error).message}`);
    }
  });
}

/** Godkjenner og bokfører lønnskjøringen i én transaksjon. */
export async function createRun(sql: postgres.Sql, company: CompanyRow, input: RunInput, actor = "bruker") {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${company.id}, 5)`;
    const preview = await previewRun(tx, company.id, input);
    const employees = new Map((await listEmployees(tx, company.id)).map((e) => [e.id, e]));
    const [{ next }] = await tx<{ next: number }[]>`
      SELECT coalesce(max(run_no), 0) + 1 AS next FROM payroll_run WHERE company_id = ${company.id}`;
    const description = input.description.trim() || `Lønn ${periodOf(input.payDate)}`;
    const entry = toPayrollEntry({ runNo: next, payDate: input.payDate, description }, preview.map((p) => p.calc));
    const posted = await insertEntry(tx, company.id, entry, actor);
    const sum = sumPayslips(preview.map((p) => p.calc));
    const [run] = await tx<{ id: number }[]>`
      INSERT INTO payroll_run (company_id, run_no, pay_date, description, entry_id, gross_ore, tax_ore, net_ore, aga_ore, holiday_pay_ore, created_by)
      VALUES (${company.id}, ${next}, ${input.payDate}, ${description}, ${posted.id}, ${sum.grossOre}, ${sum.taxOre},
              ${sum.netOre}, ${sum.agaOre}, ${sum.holidayPayOre}, ${actor})
      RETURNING id`;
    for (const p of preview) {
      const c = p.calc;
      const emp = employees.get(p.employeeId)!;
      const [slip] = await tx<{ id: number }[]>`
        INSERT INTO payslip (run_id, company_id, employee_id, employee_snapshot, tax_mode, tax_percent, gross_ore, tax_ore, net_ore,
          aga_basis_ore, aga_ore, holiday_basis_ore, holiday_pay_ore, holiday_aga_ore)
        VALUES (${run.id}, ${company.id}, ${p.employeeId}, ${tx.json(emp as never)}, ${p.tax.mode},
          ${p.tax.mode === "percent" ? p.tax.percent : null}, ${c.grossOre}, ${c.taxOre}, ${c.netOre},
          ${c.agaBasisSalaryOre + c.agaBasisHolidayOre}, ${c.agaSalaryOre + c.agaHolidayOre}, ${c.holidayBasisOre},
          ${c.holidayPayOre}, ${c.holidayAgaOre})
        RETURNING id`;
      for (const l of c.lines) {
        await tx`INSERT INTO payslip_line (payslip_id, type, description, quantity, rate_ore, amount_ore)
                 VALUES (${slip.id}, ${l.type}, ${l.description ?? null}, ${l.quantity}, ${l.rateOre}, ${l.amountOre})`;
      }
    }
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${company.id}, ${actor}, 'approve', 'payroll_run', ${String(run.id)}, ${tx.json(input as never)})`;
    return { id: run.id, runNo: next, voucherNo: posted.voucherNo };
  });
}

/** Reverserer en lønnskjøring som ikke er utbetalt: motpostering og negative lønnsslipper (nuller ut i a-meldingen). */
export async function reverseRun(sql: postgres.Sql, companyId: number, runId: number, date: string, actor = "bruker") {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${companyId}, 5)`;
    const [run] = await tx<{ id: number; run_no: number; entry_id: string; reverses_run_id: number | null; description: string }[]>`
      SELECT id, run_no, entry_id::text, reverses_run_id, description FROM payroll_run WHERE id = ${runId} AND company_id = ${companyId}`;
    if (!run) throw new Error("Fant ikke lønnskjøringen");
    if (run.reverses_run_id) throw new Error("En reversering kan ikke reverseres");
    const [already] = await tx`SELECT 1 FROM payroll_run WHERE reverses_run_id = ${runId}`;
    if (already) throw new Error("Lønnskjøringen er allerede reversert");
    const [paid] = await tx`SELECT 1 FROM payroll_payment WHERE run_id = ${runId}`;
    if (paid) throw new Error("Lønnen er utbetalt. Lag en ny korreksjonskjøring med negative linjer i stedet.");
    const [{ next }] = await tx<{ next: number }[]>`
      SELECT coalesce(max(run_no), 0) + 1 AS next FROM payroll_run WHERE company_id = ${companyId}`;

    const [orig] = await tx<{ entry_date: string; description: string; document_ref: string }[]>`
      SELECT to_char(entry_date, 'YYYY-MM-DD') AS entry_date, description, document_ref FROM journal_entry WHERE id = ${run.entry_id}`;
    const lines = await tx<{ account: string; amount_ore: string; description: string | null }[]>`
      SELECT account, amount_ore::text, description FROM journal_line WHERE entry_id = ${run.entry_id} ORDER BY id`;
    const original: JournalEntryDraft = {
      date: orig.entry_date, description: orig.description, documentRef: orig.document_ref,
      lines: lines.map((l) => ({ account: l.account, amount: Number(l.amount_ore), description: l.description ?? undefined })),
    };
    const posted = await insertEntry(tx, companyId, reverseEntry(original, date, `lonn:${next}`), actor);
    const description = `Reversering av lønnskjøring ${run.run_no}`;
    const [newRun] = await tx<{ id: number }[]>`
      INSERT INTO payroll_run (company_id, run_no, pay_date, description, reverses_run_id, entry_id, gross_ore, tax_ore, net_ore, aga_ore, holiday_pay_ore, created_by)
      SELECT company_id, ${next}, ${date}, ${description}, id, ${posted.id}, -gross_ore, -tax_ore, -net_ore, -aga_ore, -holiday_pay_ore, ${actor}
      FROM payroll_run WHERE id = ${runId}
      RETURNING id`;
    const slips = await tx<{ id: number }[]>`SELECT id FROM payslip WHERE run_id = ${runId} ORDER BY id`;
    for (const s of slips) {
      const [ns] = await tx<{ id: number }[]>`
        INSERT INTO payslip (run_id, company_id, employee_id, employee_snapshot, tax_mode, tax_percent, gross_ore, tax_ore, net_ore,
          aga_basis_ore, aga_ore, holiday_basis_ore, holiday_pay_ore, holiday_aga_ore)
        SELECT ${newRun.id}, company_id, employee_id, employee_snapshot, tax_mode, tax_percent, -gross_ore, -tax_ore, -net_ore,
          -aga_basis_ore, -aga_ore, -holiday_basis_ore, -holiday_pay_ore, -holiday_aga_ore
        FROM payslip WHERE id = ${s.id}
        RETURNING id`;
      await tx`INSERT INTO payslip_line (payslip_id, type, description, quantity, rate_ore, amount_ore)
               SELECT ${ns.id}, type, description, -quantity, rate_ore, -amount_ore FROM payslip_line WHERE payslip_id = ${s.id} ORDER BY id`;
    }
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, ${actor}, 'reverse', 'payroll_run', ${String(runId)}, ${tx.json({ newRunId: newRun.id, date } as never)})`;
    return { id: newRun.id, runNo: next, voucherNo: posted.voucherNo };
  });
}

/** Bokfører utbetalingen av nettolønn (og eventuelt overføring til skattetrekkskonto). */
export async function registerPayout(sql: postgres.Sql, companyId: number, runId: number, date: string, transferTax: boolean, actor = "bruker") {
  return sql.begin(async (tx) => {
    const [run] = await tx<{ run_no: number; net_ore: string; tax_ore: string; reverses_run_id: number | null }[]>`
      SELECT run_no, net_ore::text, tax_ore::text, reverses_run_id FROM payroll_run WHERE id = ${runId} AND company_id = ${companyId}`;
    if (!run) throw new Error("Fant ikke lønnskjøringen");
    if (run.reverses_run_id) throw new Error("En reversering utbetales ikke");
    const [reversed] = await tx`SELECT 1 FROM payroll_run WHERE reverses_run_id = ${runId}`;
    if (reversed) throw new Error("Lønnskjøringen er reversert");
    const [paid] = await tx`SELECT 1 FROM payroll_payment WHERE run_id = ${runId}`;
    if (paid) throw new Error("Utbetalingen er allerede registrert");
    const entry = toPayoutEntry({ runNo: run.run_no, netOre: Number(run.net_ore), taxOre: Number(run.tax_ore) }, date, transferTax);
    const posted = await insertEntry(tx, companyId, entry, actor);
    await tx`INSERT INTO payroll_payment (company_id, run_id, paid_date, entry_id) VALUES (${companyId}, ${runId}, ${date}, ${posted.id})`;
    return posted;
  });
}

export interface RunListItem {
  id: number;
  run_no: number;
  pay_date: string;
  description: string;
  reverses_run_id: number | null;
  reversed_by: number | null;
  gross_ore: string;
  tax_ore: string;
  net_ore: string;
  aga_ore: string;
  holiday_pay_ore: string;
  paid_date: string | null;
  slips: number;
}

export async function listRuns(sql: Sql, companyId: number): Promise<RunListItem[]> {
  return sql<RunListItem[]>`
    SELECT r.id, r.run_no, to_char(r.pay_date, 'YYYY-MM-DD') AS pay_date, r.description, r.reverses_run_id,
      (SELECT x.run_no FROM payroll_run x WHERE x.reverses_run_id = r.id) AS reversed_by,
      r.gross_ore::text, r.tax_ore::text, r.net_ore::text, r.aga_ore::text, r.holiday_pay_ore::text,
      to_char(p.paid_date, 'YYYY-MM-DD') AS paid_date,
      (SELECT count(*)::int FROM payslip s WHERE s.run_id = r.id) AS slips
    FROM payroll_run r LEFT JOIN payroll_payment p ON p.run_id = r.id
    WHERE r.company_id = ${companyId} ORDER BY r.run_no DESC`;
}

export interface PayslipDetail {
  id: number;
  employee_id: number;
  employee: EmployeeRow;
  tax_mode: "percent" | "manual";
  tax_percent: number | null;
  gross_ore: string;
  tax_ore: string;
  net_ore: string;
  aga_ore: string;
  holiday_basis_ore: string;
  holiday_pay_ore: string;
  lines: { type: PayItemType; description: string | null; quantity: number; rate_ore: string; amount_ore: string }[];
  ytd: { gross_ore: string; tax_ore: string; holiday_basis_ore: string; holiday_pay_ore: string };
}

export async function getRun(sql: Sql, companyId: number, id: number) {
  const [run] = await sql<(RunListItem & { voucher_no: number; payout_voucher_no: number | null; reverses_run_no: number | null })[]>`
    SELECT r.id, r.run_no, to_char(r.pay_date, 'YYYY-MM-DD') AS pay_date, r.description, r.reverses_run_id,
      (SELECT x.run_no FROM payroll_run x WHERE x.id = r.reverses_run_id) AS reverses_run_no,
      (SELECT x.run_no FROM payroll_run x WHERE x.reverses_run_id = r.id) AS reversed_by,
      r.gross_ore::text, r.tax_ore::text, r.net_ore::text, r.aga_ore::text, r.holiday_pay_ore::text,
      to_char(p.paid_date, 'YYYY-MM-DD') AS paid_date, e.voucher_no,
      (SELECT pe.voucher_no FROM journal_entry pe WHERE pe.id = p.entry_id) AS payout_voucher_no,
      (SELECT count(*)::int FROM payslip s WHERE s.run_id = r.id) AS slips
    FROM payroll_run r JOIN journal_entry e ON e.id = r.entry_id LEFT JOIN payroll_payment p ON p.run_id = r.id
    WHERE r.company_id = ${companyId} AND r.id = ${id}`;
  if (!run) return null;
  const slips = await sql<PayslipDetail[]>`
    SELECT s.id, s.employee_id, s.employee_snapshot AS employee, s.tax_mode, s.tax_percent,
      s.gross_ore::text, s.tax_ore::text, s.net_ore::text, s.aga_ore::text, s.holiday_basis_ore::text, s.holiday_pay_ore::text,
      (SELECT coalesce(json_agg(json_build_object('type', l.type, 'description', l.description, 'quantity', l.quantity::float8,
         'rate_ore', l.rate_ore::text, 'amount_ore', l.amount_ore::text) ORDER BY l.id), '[]')
       FROM payslip_line l WHERE l.payslip_id = s.id) AS lines,
      (SELECT json_build_object('gross_ore', sum(y.gross_ore)::text, 'tax_ore', sum(y.tax_ore)::text,
         'holiday_basis_ore', sum(y.holiday_basis_ore)::text, 'holiday_pay_ore', sum(y.holiday_pay_ore)::text)
       FROM payslip y JOIN payroll_run yr ON yr.id = y.run_id
       WHERE y.employee_id = s.employee_id AND yr.company_id = ${companyId}
         AND yr.pay_date >= date_trunc('year', ${run.pay_date}::date) AND (yr.pay_date, yr.run_no) <= (${run.pay_date}::date, ${run.run_no})) AS ytd
    FROM payslip s WHERE s.run_id = ${id} ORDER BY (s.employee_snapshot->>'employee_no')::int`;
  return { run, slips };
}

/** Avsatte feriepenger per ansatt for opptjeningsåret (utbetales normalt i juni året etter). */
export async function holidayPaySummary(sql: Sql, companyId: number, year: number) {
  return sql<{ employee_id: number; name: string; basis_ore: string; holiday_pay_ore: string; paid_ore: string }[]>`
    SELECT e.id AS employee_id, e.name,
      coalesce(sum(s.holiday_basis_ore) FILTER (WHERE extract(year FROM r.pay_date) = ${year}), 0)::text AS basis_ore,
      coalesce(sum(s.holiday_pay_ore) FILTER (WHERE extract(year FROM r.pay_date) = ${year}), 0)::text AS holiday_pay_ore,
      coalesce((SELECT sum(l.amount_ore) FROM payslip_line l JOIN payslip ps ON ps.id = l.payslip_id JOIN payroll_run pr ON pr.id = ps.run_id
                WHERE ps.employee_id = e.id AND l.type = 'feriepenger' AND extract(year FROM pr.pay_date) = ${year + 1}), 0)::text AS paid_ore
    FROM employee e
    LEFT JOIN payslip s ON s.employee_id = e.id
    LEFT JOIN payroll_run r ON r.id = s.run_id
    WHERE e.company_id = ${companyId}
    GROUP BY e.id, e.name ORDER BY e.name`;
}

/** Forskuddstrekk og arbeidsgiveravgift per måned (grunnlag for terminoppgjør og a-melding). */
export async function monthlyTotals(sql: Sql, companyId: number) {
  return sql<{ period: string; runs: number; gross_ore: string; tax_ore: string; aga_ore: string }[]>`
    SELECT to_char(pay_date, 'YYYY-MM') AS period, count(*)::int AS runs,
      sum(gross_ore)::text AS gross_ore, sum(tax_ore)::text AS tax_ore, sum(aga_ore)::text AS aga_ore
    FROM payroll_run WHERE company_id = ${companyId}
    GROUP BY 1 ORDER BY 1 DESC`;
}

// ---------- A-melding ----------

export async function buildAMeldingInput(
  sql: Sql, company: CompanyRow, period: string, meldingsId: string, replacesMeldingsId: string | null,
): Promise<AMeldingInput> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Ugyldig måned");
  const settings = await getPayrollSettings(sql, company.id);
  if (!settings) throw new Error("Fyll ut lønnsinnstillingene først (Lønn → Innstillinger)");
  const [y, m] = period.split("-").map(Number);
  const slips = await sql<{ employee_id: number; tax_ore: string; aga_basis_ore: string }[]>`
    SELECT s.employee_id, s.tax_ore::text, s.aga_basis_ore::text
    FROM payslip s JOIN payroll_run r ON r.id = s.run_id
    WHERE r.company_id = ${company.id} AND r.pay_date >= make_date(${y}, ${m}, 1) AND r.pay_date < make_date(${y}, ${m}, 1) + interval '1 month'`;
  const lines = await sql<{ employee_id: number; type: PayItemType; amount_ore: string }[]>`
    SELECT s.employee_id, l.type, sum(l.amount_ore)::text AS amount_ore
    FROM payslip_line l JOIN payslip s ON s.id = l.payslip_id JOIN payroll_run r ON r.id = s.run_id
    WHERE r.company_id = ${company.id} AND r.pay_date >= make_date(${y}, ${m}, 1) AND r.pay_date < make_date(${y}, ${m}, 1) + interval '1 month'
    GROUP BY s.employee_id, l.type`;
  const paidIds = new Set(slips.map((s) => s.employee_id));
  const employees = (await listEmployees(sql, company.id)).filter((e) => paidIds.has(e.id) || isActiveIn(e, period));
  const list: AMeldingEmployee[] = employees.map((e) => {
    const income: Partial<Record<PayItemType, number>> = {};
    for (const l of lines) if (l.employee_id === e.id && PAY_ITEMS[l.type]) income[l.type] = Number(l.amount_ore);
    return {
      nationalId: e.national_id,
      name: e.name,
      employmentId: e.employment_id,
      startDate: e.start_date,
      endDate: e.end_date,
      occupationCode: e.occupation_code,
      positionPct: e.position_pct,
      hoursPerWeek: e.hours_per_week,
      payType: e.pay_type,
      income,
      taxOre: slips.filter((s) => s.employee_id === e.id).reduce((s, x) => s + Number(x.tax_ore), 0),
    };
  });
  return {
    period,
    meldingsId,
    replacesMeldingsId,
    createdAt: `${new Date().toISOString().slice(0, 19)}Z`,
    orgNo: company.org_no,
    businessUnitOrgNo: settings.business_unit_org_no,
    agaZone: settings.aga_zone,
    agaBasisOre: slips.reduce((s, x) => s + Number(x.aga_basis_ore), 0),
    employees: list,
  };
}

/** Lager og lagrer a-meldingen for måneden. En ny versjon erstatter den forrige for samme måned. */
export async function createAMelding(sql: postgres.Sql, company: CompanyRow, period: string) {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${company.id}, 6)`;
    const [prev] = await tx<{ melding_id: string }[]>`
      SELECT melding_id::text FROM a_melding WHERE company_id = ${company.id} AND period = ${period} ORDER BY id DESC LIMIT 1`;
    const meldingsId = randomUUID();
    const input = await buildAMeldingInput(tx, company, period, meldingsId, prev?.melding_id ?? null);
    const xml = buildAMeldingXml(input);
    const sum = aMeldingSummary(input);
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO a_melding (company_id, period, melding_id, replaces_melding_id, sum_tax_ore, sum_aga_ore, xml)
      VALUES (${company.id}, ${period}, ${meldingsId}, ${prev?.melding_id ?? null}, ${sum.sumTaxOre}, ${sum.sumAgaOre}, ${xml})
      RETURNING id`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${company.id}, 'bruker', 'create', 'a_melding', ${String(row.id)}, ${tx.json({ period, meldingsId } as never)})`;
    return { id: row.id, meldingsId, ...sum };
  });
}

export async function listAMeldinger(sql: Sql, companyId: number) {
  return sql<{ id: number; period: string; melding_id: string; replaces_melding_id: string | null; sum_tax_ore: string; sum_aga_ore: string; created_at: string }[]>`
    SELECT id, period, melding_id::text, replaces_melding_id::text, sum_tax_ore::text, sum_aga_ore::text,
      to_char(created_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD HH24:MI') AS created_at
    FROM a_melding WHERE company_id = ${companyId} ORDER BY period DESC, id DESC`;
}

export async function getAMelding(sql: Sql, companyId: number, id: number) {
  const [row] = await sql<{ period: string; melding_id: string; xml: string }[]>`
    SELECT period, melding_id::text, xml FROM a_melding WHERE company_id = ${companyId} AND id = ${id}`;
  return row ?? null;
}
