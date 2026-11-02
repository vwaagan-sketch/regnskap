import type postgres from "postgres";
import { insertEntry } from "./ledger-repo";
import { termPeriod } from "@/lib/vat-report";
import type { JournalLine } from "@/lib/ledger";

export const VAT_SETTLEMENT_ACCOUNT = "2740";
const VAT_ACCOUNTS = ["2700", "2701", "2702", "2710"];

export const settlementRef = (year: number, term: string) => `mva-oppgjor:${year}-${term}`;

export async function getSettlement(sql: postgres.Sql, companyId: number, year: number, term: string) {
  const [row] = await sql<{ voucher_no: number; entry_date: string }[]>`
    SELECT voucher_no, to_char(entry_date, 'YYYY-MM-DD') AS entry_date FROM journal_entry
    WHERE company_id = ${companyId} AND document_ref = ${settlementRef(year, term)}`;
  return row ?? null;
}

/**
 * Avslutter en MVA-termin: flytter saldoene på MVA-kontoene for terminen til oppgjørskonto 2740.
 * Betalingen til Skatteetaten bokføres senere som et vanlig bilag (debet 2740, kredit bank).
 */
export async function settleVat(sql: postgres.Sql, companyId: number, year: number, term: string, actor: string) {
  const period = termPeriod(year, term);
  if (!period) throw new Error("Ugyldig termin");
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${companyId})`;
    const [done] = await tx`SELECT 1 FROM journal_entry WHERE company_id = ${companyId} AND document_ref = ${settlementRef(year, term)}`;
    if (done) throw new Error("Terminen er allerede avsluttet");
    const sums = await tx<{ account: string; sum: string }[]>`
      SELECT l.account, sum(l.amount_ore)::text AS sum
      FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
      WHERE l.company_id = ${companyId} AND l.account IN ${tx(VAT_ACCOUNTS)}
        AND e.entry_date BETWEEN ${period.from} AND ${period.to}
      GROUP BY l.account HAVING sum(l.amount_ore) <> 0`;
    if (sums.length === 0) throw new Error("Ingen MVA å avslutte i terminen");
    const lines: JournalLine[] = sums.map((s) => ({ account: s.account, amount: -Number(s.sum) }));
    const net = sums.reduce((t, s) => t + Number(s.sum), 0);
    if (net !== 0) lines.push({ account: VAT_SETTLEMENT_ACCOUNT, amount: net, description: net < 0 ? "Skyldig MVA" : "MVA til gode" });
    return insertEntry(tx, companyId, {
      date: period.to,
      description: `MVA-oppgjør ${period.label}`,
      documentRef: settlementRef(year, term),
      lines,
    }, actor);
  });
}
