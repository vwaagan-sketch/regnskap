import type postgres from "postgres";
import { validateEntry, type JournalEntryDraft } from "@/lib/ledger";

type Tx = postgres.TransactionSql;

/**
 * Bokfører en postering inne i en pågående transaksjon, med fortløpende bilagsnummer.
 * Bruk denne når posteringen må lagres sammen med andre data (faktura, dokument).
 */
export async function insertEntry(
  tx: Tx,
  companyId: number,
  entry: JournalEntryDraft,
  actor: string,
  documentId: string | null = null,
): Promise<{ id: string; voucherNo: number }> {
  validateEntry(entry);
  await tx`SELECT pg_advisory_xact_lock(${companyId})`;
  const [{ next }] = await tx<{ next: number }[]>`
    SELECT coalesce(max(voucher_no), 0) + 1 AS next FROM journal_entry WHERE company_id = ${companyId}`;
  const [row] = await tx<{ id: string }[]>`
    INSERT INTO journal_entry (company_id, voucher_no, entry_date, description, document_ref, created_by, document_id)
    VALUES (${companyId}, ${next}, ${entry.date}, ${entry.description}, ${entry.documentRef}, ${actor}, ${documentId})
    RETURNING id`;
  for (const l of entry.lines) {
    await tx`
      INSERT INTO journal_line (entry_id, company_id, account, amount_ore, vat_code, description)
      VALUES (${row.id}, ${companyId}, ${l.account}, ${l.amount}, ${l.vatCode ?? null}, ${l.description ?? null})`;
  }
  await tx`
    INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
    VALUES (${companyId}, ${actor}, 'post', 'journal_entry', ${row.id}, ${tx.json(entry as never)})`;
  return { id: String(row.id), voucherNo: next };
}

/** Bokfører en postering i egen transaksjon. */
export async function postEntry(
  sql: postgres.Sql,
  companyId: number,
  entry: JournalEntryDraft,
  actor: string,
): Promise<{ id: string; voucherNo: number }> {
  return sql.begin((tx) => insertEntry(tx, companyId, entry, actor)) as Promise<{ id: string; voucherNo: number }>;
}

export interface EntryWithLines {
  id: string;
  voucher_no: number;
  entry_date: string;
  description: string;
  document_ref: string;
  document_id: string | null;
  created_by: string;
  lines: { account: string; amount_ore: string; vat_code: string | null; description: string | null }[];
}

export async function listEntries(sql: postgres.Sql, companyId: number, limit = 200): Promise<EntryWithLines[]> {
  return sql<EntryWithLines[]>`
    SELECT e.id::text, e.voucher_no, to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date, e.description,
           e.document_ref, e.document_id::text, e.created_by,
           coalesce(json_agg(json_build_object(
             'account', l.account, 'amount_ore', l.amount_ore::text,
             'vat_code', l.vat_code, 'description', l.description) ORDER BY l.id), '[]') AS lines
    FROM journal_entry e JOIN journal_line l ON l.entry_id = e.id
    WHERE e.company_id = ${companyId}
    GROUP BY e.id ORDER BY e.voucher_no DESC LIMIT ${limit}`;
}

export async function trialBalanceForYear(sql: postgres.Sql, companyId: number, year: number) {
  return sql<{ account: string; name: string; balance_ore: string }[]>`
    SELECT l.account, a.name, sum(l.amount_ore)::text AS balance_ore
    FROM journal_line l
    JOIN journal_entry e ON e.id = l.entry_id
    JOIN account a ON a.company_id = l.company_id AND a.number = l.account
    WHERE l.company_id = ${companyId}
      AND e.entry_date >= make_date(${year}, 1, 1) AND e.entry_date < make_date(${year + 1}, 1, 1)
    GROUP BY l.account, a.name ORDER BY l.account`;
}

export async function dashboardStats(sql: postgres.Sql, companyId: number, year: number) {
  const [k] = await sql<{ bank: string; receivables: string; payables: string; vat: string; result: string }[]>`
    SELECT
      coalesce(sum(l.amount_ore) FILTER (WHERE l.account IN ('1900','1920')), 0)::text AS bank,
      coalesce(sum(l.amount_ore) FILTER (WHERE l.account = '1500'), 0)::text AS receivables,
      coalesce(-sum(l.amount_ore) FILTER (WHERE l.account = '2400'), 0)::text AS payables,
      coalesce(-sum(l.amount_ore) FILTER (WHERE l.account BETWEEN '2700' AND '2749'), 0)::text AS vat,
      coalesce(-sum(l.amount_ore) FILTER (WHERE l.account >= '3000'
        AND e.entry_date >= make_date(${year}, 1, 1) AND e.entry_date < make_date(${year + 1}, 1, 1)), 0)::text AS result
    FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
    WHERE l.company_id = ${companyId}`;
  const months = await sql<{ month: number; income: string; costs: string }[]>`
    SELECT extract(month FROM e.entry_date)::int AS month,
      coalesce(-sum(l.amount_ore) FILTER (WHERE l.account BETWEEN '3000' AND '3999'), 0)::text AS income,
      coalesce(sum(l.amount_ore) FILTER (WHERE l.account BETWEEN '4000' AND '7999'), 0)::text AS costs
    FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
    WHERE l.company_id = ${companyId}
      AND e.entry_date >= make_date(${year}, 1, 1) AND e.entry_date < make_date(${year + 1}, 1, 1)
    GROUP BY 1 ORDER BY 1`;
  return { ...k, months };
}
