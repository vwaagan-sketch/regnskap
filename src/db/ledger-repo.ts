import type postgres from "postgres";
import { validateEntry, type JournalEntryDraft } from "@/lib/ledger";

/** Bokfører en postering i én transaksjon med fortløpende bilagsnummer. */
export async function postEntry(
  sql: postgres.Sql,
  companyId: number,
  entry: JournalEntryDraft,
  actor: string,
): Promise<{ id: string; voucherNo: number }> {
  validateEntry(entry);
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${companyId})`;
    const [{ next }] = await tx<{ next: number }[]>`
      SELECT coalesce(max(voucher_no), 0) + 1 AS next FROM journal_entry WHERE company_id = ${companyId}`;
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO journal_entry (company_id, voucher_no, entry_date, description, document_ref, created_by)
      VALUES (${companyId}, ${next}, ${entry.date}, ${entry.description}, ${entry.documentRef}, ${actor})
      RETURNING id`;
    for (const l of entry.lines) {
      await tx`
        INSERT INTO journal_line (entry_id, company_id, account, amount_ore, vat_code, description)
        VALUES (${row.id}, ${companyId}, ${l.account}, ${l.amount}, ${l.vatCode ?? null}, ${l.description ?? null})`;
    }
    await tx`
      INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
      VALUES (${companyId}, ${actor}, 'post', 'journal_entry', ${row.id}, ${tx.json(entry as never)})`;
    return { id: row.id, voucherNo: next };
  }) as Promise<{ id: string; voucherNo: number }>;
}
