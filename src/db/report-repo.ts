import type postgres from "postgres";

/**
 * Rapporter fra hovedboken. Resultatkontoer (3000–8999) nullstilles ved årsskiftet:
 * tidligere års resultat legges til inngående balanse på 2050 Annen egenkapital.
 */
export const RETAINED_EARNINGS = "2050";
export const isResultAccount = (a: string) => a >= "3000";

export interface AccountBalance {
  number: string;
  name: string;
  openingOre: number;
  debitOre: number;
  creditOre: number;
  closingOre: number;
}

const yearStart = (date: string) => `${date.slice(0, 4)}-01-01`;

export async function accountBalances(sql: postgres.Sql, companyId: number, from: string, to: string): Promise<AccountBalance[]> {
  const ys = yearStart(from);
  const rows = await sql<{ number: string; name: string; before_year: string; in_year_before: string; debit: string; credit: string }[]>`
    SELECT a.number, a.name,
      coalesce(sum(l.amount_ore) FILTER (WHERE e.entry_date < ${ys}), 0)::text AS before_year,
      coalesce(sum(l.amount_ore) FILTER (WHERE e.entry_date >= ${ys} AND e.entry_date < ${from}), 0)::text AS in_year_before,
      coalesce(sum(l.amount_ore) FILTER (WHERE e.entry_date BETWEEN ${from} AND ${to} AND l.amount_ore > 0), 0)::text AS debit,
      coalesce(-sum(l.amount_ore) FILTER (WHERE e.entry_date BETWEEN ${from} AND ${to} AND l.amount_ore < 0), 0)::text AS credit
    FROM account a
    LEFT JOIN journal_line l ON l.company_id = a.company_id AND l.account = a.number
    LEFT JOIN journal_entry e ON e.id = l.entry_id
    WHERE a.company_id = ${companyId}
    GROUP BY a.number, a.name ORDER BY a.number`;
  const priorResult = rows.filter((r) => isResultAccount(r.number)).reduce((s, r) => s + Number(r.before_year), 0);
  return rows.map((r) => {
    let opening = Number(r.in_year_before) + (isResultAccount(r.number) ? 0 : Number(r.before_year));
    if (r.number === RETAINED_EARNINGS) opening += priorResult;
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    return { number: r.number, name: r.name, openingOre: opening, debitOre: debit, creditOre: credit, closingOre: opening + debit - credit };
  });
}

/** Kobler linjer til kunde via fakturanummeret i bilagsreferansen (faktura, kreditnota, innbetaling). */
const CUSTOMER_JOIN = (sql: postgres.Sql) => sql`
  LEFT JOIN invoice i ON i.company_id = e.company_id
    AND i.number = (CASE WHEN e.document_ref ~ '^(invoice|credit_note|innbetaling):[0-9]{1,9}$'
                         THEN split_part(e.document_ref, ':', 2)::int END)
  LEFT JOIN customer c ON c.id = i.customer_id`;

export interface LedgerEntry {
  id: string;
  voucherNo: number;
  date: string;
  systemDate: string;
  description: string;
  documentRef: string;
  lines: { account: string; amountOre: number; vatCode: string | null; description: string | null; customerNo: number | null }[];
}

export async function entriesInPeriod(sql: postgres.Sql, companyId: number, from: string, to: string): Promise<LedgerEntry[]> {
  const rows = await sql<{
    id: string; voucher_no: number; entry_date: string; created: string; description: string; document_ref: string; customer_no: number | null;
    lines: { account: string; amount_ore: number; vat_code: string | null; description: string | null }[];
  }[]>`
    SELECT e.id::text, e.voucher_no, to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date,
      to_char(e.created_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD') AS created, e.description, e.document_ref,
      min(c.customer_no) AS customer_no,
      (SELECT json_agg(json_build_object('account', l.account, 'amount_ore', l.amount_ore, 'vat_code', l.vat_code, 'description', l.description) ORDER BY l.id)
         FROM journal_line l WHERE l.entry_id = e.id) AS lines
    FROM journal_entry e ${CUSTOMER_JOIN(sql)}
    WHERE e.company_id = ${companyId} AND e.entry_date BETWEEN ${from} AND ${to}
    GROUP BY e.id ORDER BY e.voucher_no`;
  return rows.map((r) => ({
    id: r.id,
    voucherNo: r.voucher_no,
    date: r.entry_date,
    systemDate: r.created,
    description: r.description,
    documentRef: r.document_ref,
    lines: r.lines.map((l) => ({
      account: l.account,
      amountOre: Number(l.amount_ore),
      vatCode: l.vat_code,
      description: l.description,
      customerNo: l.account === "1500" ? r.customer_no : null,
    })),
  }));
}

export interface CustomerBalance {
  customerNo: number;
  name: string;
  orgNo: string | null;
  address: string;
  postalCode: string;
  city: string;
  openingOre: number;
  debitOre: number;
  creditOre: number;
  closingOre: number;
}

/** Kundespesifikasjon: bevegelser på kundefordringer (1500) per kunde. */
export async function customerBalances(sql: postgres.Sql, companyId: number, from: string, to: string): Promise<CustomerBalance[]> {
  const rows = await sql<{ customer_no: number; name: string; org_no: string | null; address: string; postal_code: string; city: string; opening: string; debit: string; credit: string }[]>`
    SELECT cu.customer_no, cu.name, cu.org_no, cu.address, cu.postal_code, cu.city,
      coalesce(sum(x.amount_ore) FILTER (WHERE x.entry_date < ${from}), 0)::text AS opening,
      coalesce(sum(x.amount_ore) FILTER (WHERE x.entry_date BETWEEN ${from} AND ${to} AND x.amount_ore > 0), 0)::text AS debit,
      coalesce(-sum(x.amount_ore) FILTER (WHERE x.entry_date BETWEEN ${from} AND ${to} AND x.amount_ore < 0), 0)::text AS credit
    FROM customer cu
    LEFT JOIN (
      SELECT c.id AS customer_id, l.amount_ore, e.entry_date
      FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id ${CUSTOMER_JOIN(sql)}
      WHERE l.company_id = ${companyId} AND l.account = '1500'
    ) x ON x.customer_id = cu.id
    WHERE cu.company_id = ${companyId}
    GROUP BY cu.id ORDER BY cu.customer_no`;
  return rows.map((r) => {
    const opening = Number(r.opening);
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    return {
      customerNo: r.customer_no, name: r.name, orgNo: r.org_no, address: r.address, postalCode: r.postal_code, city: r.city,
      openingOre: opening, debitOre: debit, creditOre: credit, closingOre: opening + debit - credit,
    };
  });
}

export interface LedgerLine {
  voucherNo: number;
  date: string;
  description: string;
  amountOre: number;
  vatCode: string | null;
}

/** Hovedbok: alle linjer på én konto i perioden. */
export async function accountLines(sql: postgres.Sql, companyId: number, account: string, from: string, to: string): Promise<LedgerLine[]> {
  const rows = await sql<{ voucher_no: number; entry_date: string; description: string; amount_ore: string; vat_code: string | null }[]>`
    SELECT e.voucher_no, to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date,
      coalesce(l.description, e.description) AS description, l.amount_ore::text, l.vat_code
    FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
    WHERE l.company_id = ${companyId} AND l.account = ${account} AND e.entry_date BETWEEN ${from} AND ${to}
    ORDER BY e.entry_date, e.voucher_no, l.id`;
  return rows.map((r) => ({ voucherNo: r.voucher_no, date: r.entry_date, description: r.description, amountOre: Number(r.amount_ore), vatCode: r.vat_code }));
}

/** Linjer med MVA-kode i perioden, til MVA-meldingen. */
export async function vatLines(sql: postgres.Sql, companyId: number, from: string, to: string) {
  const rows = await sql<{ account: string; amount_ore: string; vat_code: string }[]>`
    SELECT l.account, l.amount_ore::text, l.vat_code
    FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
    WHERE l.company_id = ${companyId} AND l.vat_code IS NOT NULL AND e.entry_date BETWEEN ${from} AND ${to}`;
  return rows.map((r) => ({ account: r.account, amountOre: Number(r.amount_ore), vatCode: r.vat_code }));
}
