import { createHash } from "node:crypto";
import type postgres from "postgres";
import { ACCOUNTS } from "@/lib/accounts";
import { parseCamt053, isCamt053 } from "@/lib/bank/camt053";
import { parseBankCsv } from "@/lib/bank/csv";
import {
  buildBankEntry, suggestMatches,
  type BankTx, type LedgerCandidate, type OpenInvoice, type Suggestion,
} from "@/lib/bank/match";
import { StatementError, dedupeKeys, type ParsedStatement } from "@/lib/bank/statement";
import type { CompanyRow } from "./company-repo";
import { storeDocument } from "./document-repo";
import { insertPayment } from "./invoice-repo";
import { insertEntry } from "./ledger-repo";

type Tx = postgres.TransactionSql;

export function parseStatementFile(content: Buffer): ParsedStatement[] {
  let text = content.toString("utf8");
  // Eldre CSV-eksport kan være i Windows-1252/Latin-1.
  if (text.includes("�")) text = content.toString("latin1");
  if (isCamt053(text)) return parseCamt053(text);
  if (/^\s*</.test(text)) throw new StatementError("XML-filen er ikke en CAMT.053-kontoutskrift");
  return [parseBankCsv(text)];
}

export interface ImportResult {
  statements: number;
  imported: number;
  duplicates: number;
  documentId: string;
}

/**
 * Importerer kontoutskrift: arkiverer originalfilen og lagrer nye transaksjoner.
 * Transaksjoner som allerede er importert (også fra overlappende utskrifter) hoppes over.
 */
export async function importStatement(
  sql: postgres.Sql,
  company: CompanyRow,
  file: { content: Buffer; filename: string; mediaType: string },
  documentDate: string,
): Promise<ImportResult> {
  const parsed = parseStatementFile(file.content);
  for (const p of parsed) {
    if (p.accountNo && /^\d{11}$/.test(p.accountNo) && p.accountNo !== company.bank_account) {
      throw new StatementError(
        `Kontoutskriften gjelder konto ${p.accountNo}, men firmaets bankkonto er ${company.bank_account}. Bare firmaets bankkonto (1920) kan avstemmes foreløpig.`,
      );
    }
  }
  const sha = createHash("sha256").update(file.content).digest("hex");
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${company.id}, 4)`;
    const [dup] = await tx`
      SELECT 1 FROM bank_statement s JOIN document d ON d.id = s.document_id
      WHERE s.company_id = ${company.id} AND d.sha256 = ${sha} LIMIT 1`;
    if (dup) throw new StatementError("Denne filen er allerede importert");
    const isXml = parsed[0].format === "camt053";
    const documentId = await storeDocument(tx, company.id, {
      kind: "bank_statement",
      content: file.content,
      mediaType: isXml ? "application/xml" : "text/csv",
      filename: file.filename,
      title: "Kontoutskrift",
      documentDate: parsed.map((p) => p.toDate).filter(Boolean).sort().at(-1) ?? documentDate,
    });
    let imported = 0;
    let duplicates = 0;
    for (const p of parsed) {
      const [st] = await tx<{ id: string }[]>`
        INSERT INTO bank_statement (company_id, format, account_no, statement_ref, from_date, to_date, opening_ore, closing_ore, document_id)
        VALUES (${company.id}, ${p.format}, ${p.accountNo ?? null}, ${p.statementRef ?? null}, ${p.fromDate ?? null},
                ${p.toDate ?? null}, ${p.openingOre ?? null}, ${p.closingOre ?? null}, ${documentId})
        RETURNING id::text`;
      const keys = dedupeKeys(p.accountNo ?? company.bank_account, p.transactions);
      for (const [i, t] of p.transactions.entries()) {
        const rows = await tx`
          INSERT INTO bank_transaction (company_id, statement_id, booking_date, value_date, amount_ore, description,
                                        counterparty, reference, bank_ref, dedupe_key)
          VALUES (${company.id}, ${st.id}, ${t.bookingDate}, ${t.valueDate ?? null}, ${t.amountOre}, ${t.description},
                  ${t.counterparty ?? null}, ${t.reference ?? null}, ${t.bankRef ?? null}, ${keys[i]})
          ON CONFLICT (company_id, dedupe_key) DO NOTHING RETURNING id`;
        if (rows.length) imported++;
        else duplicates++;
      }
    }
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${company.id}, 'bruker', 'import', 'bank_statement', ${documentId},
                     ${tx.json({ filename: file.filename, imported, duplicates })})`;
    return { statements: parsed.length, imported, duplicates, documentId };
  }) as Promise<ImportResult>;
}

export interface BankTransactionRow {
  id: string;
  booking_date: string;
  amount_ore: string;
  description: string;
  counterparty: string | null;
  reference: string | null;
  bank_ref: string | null;
  document_id: string;
  match_kind: "invoice_payment" | "new_entry" | "existing_entry" | null;
  voucher_no: number | null;
  entry_id: string | null;
}

export async function listBankTransactions(sql: postgres.Sql | Tx, companyId: number, only?: "open" | "matched") {
  return sql<BankTransactionRow[]>`
    SELECT t.id::text, to_char(t.booking_date, 'YYYY-MM-DD') AS booking_date, t.amount_ore::text, t.description,
           t.counterparty, t.reference, t.bank_ref, s.document_id::text,
           m.kind AS match_kind, e.voucher_no, e.id::text AS entry_id
    FROM bank_transaction t
    JOIN bank_statement s ON s.id = t.statement_id
    LEFT JOIN bank_match m ON m.transaction_id = t.id
    LEFT JOIN journal_entry e ON e.id = m.entry_id
    WHERE t.company_id = ${companyId}
      ${only === "open" ? sql`AND m.id IS NULL` : only === "matched" ? sql`AND m.id IS NOT NULL` : sql``}
    ORDER BY t.booking_date DESC, t.id DESC
    LIMIT 1000`;
}

/** Første dato som er dekket av importerte kontoutskrifter. */
export async function bankStartDate(sql: postgres.Sql | Tx, companyId: number): Promise<string | null> {
  const [r] = await sql<{ d: string | null }[]>`
    SELECT to_char(least(
      (SELECT min(from_date) FROM bank_statement WHERE company_id = ${companyId}),
      (SELECT min(booking_date) FROM bank_transaction WHERE company_id = ${companyId})), 'YYYY-MM-DD') AS d`;
  return r?.d ?? null;
}

/** Posteringer på bankkontoen fra og med en dato som ikke er koblet til en banktransaksjon. */
export async function unmatchedLedgerEntries(sql: postgres.Sql | Tx, companyId: number, fromDate: string | null): Promise<LedgerCandidate[]> {
  if (!fromDate) return [];
  const rows = await sql<{ entry_id: string; voucher_no: number; date: string; amount_ore: string; description: string }[]>`
    SELECT e.id::text AS entry_id, e.voucher_no, to_char(e.entry_date, 'YYYY-MM-DD') AS date,
           sum(l.amount_ore)::text AS amount_ore, e.description
    FROM journal_entry e JOIN journal_line l ON l.entry_id = e.id
    WHERE e.company_id = ${companyId} AND l.account = ${ACCOUNTS.bank} AND e.entry_date >= ${fromDate}
      AND NOT EXISTS (SELECT 1 FROM bank_match m WHERE m.entry_id = e.id)
    GROUP BY e.id
    HAVING sum(l.amount_ore) <> 0
    ORDER BY e.entry_date DESC, e.voucher_no DESC`;
  return rows.map((r) => ({ entryId: r.entry_id, voucherNo: r.voucher_no, date: r.date, amountOre: Number(r.amount_ore), description: r.description }));
}

export async function openInvoices(sql: postgres.Sql | Tx, companyId: number): Promise<OpenInvoice[]> {
  const rows = await sql<{ id: number; number: number; kid: string | null; open_ore: string; customer_name: string }[]>`
    SELECT i.id, i.number, i.kid, c.name AS customer_name,
           (i.gross_ore - coalesce((SELECT sum(p.amount_ore) FROM invoice_payment p WHERE p.invoice_id = i.id), 0))::text AS open_ore
    FROM invoice i JOIN customer c ON c.id = i.customer_id
    WHERE i.company_id = ${companyId} AND i.kind = 'invoice'`;
  return rows
    .map((r) => ({ id: r.id, number: r.number, kid: r.kid, openOre: Number(r.open_ore), customerName: r.customer_name }))
    .filter((r) => r.openOre > 0);
}

export function toBankTx(r: BankTransactionRow): BankTx {
  return { id: r.id, date: r.booking_date, amountOre: Number(r.amount_ore), description: r.description, counterparty: r.counterparty, reference: r.reference };
}

export async function reconciliationSuggestions(sql: postgres.Sql | Tx, companyId: number) {
  const start = await bankStartDate(sql, companyId);
  const open = await listBankTransactions(sql, companyId, "open");
  const invoices = await openInvoices(sql, companyId);
  // Litt slingringsmonn før første bankdato, i tilfelle bilaget er datert før banken bokførte.
  const entries = await unmatchedLedgerEntries(sql, companyId, start ? shiftDate(start, -10) : null);
  return { open, invoices, entries, suggestions: suggestMatches(open.map(toBankTx), invoices, entries) };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type MatchAction =
  | { kind: "invoice"; invoiceId: number }
  | { kind: "entry"; entryId: string }
  | { kind: "new"; account: string; vatCategory?: "high" | "medium" | "low" | null; description?: string };

/** Avstemmer én banktransaksjon: bokfører innbetaling eller ny postering, eller kobler til eksisterende bilag. */
export async function reconcileTransaction(
  sql: postgres.Sql,
  company: CompanyRow,
  transactionId: string,
  action: MatchAction,
  actor = "bruker",
): Promise<{ voucherNo: number }> {
  return sql.begin((tx) => reconcileInTx(tx, company, transactionId, action, actor)) as Promise<{ voucherNo: number }>;
}

async function reconcileInTx(tx: Tx, company: CompanyRow, transactionId: string, action: MatchAction, actor: string) {
  await tx`SELECT pg_advisory_xact_lock(${company.id}, 5)`;
  const [t] = await tx<{ id: string; booking_date: string; amount_ore: string; description: string; bank_ref: string | null; document_id: string; matched: boolean }[]>`
    SELECT t.id::text, to_char(t.booking_date, 'YYYY-MM-DD') AS booking_date, t.amount_ore::text, t.description, t.bank_ref,
           s.document_id::text, EXISTS (SELECT 1 FROM bank_match m WHERE m.transaction_id = t.id) AS matched
    FROM bank_transaction t JOIN bank_statement s ON s.id = t.statement_id
    WHERE t.id = ${transactionId} AND t.company_id = ${company.id}`;
  if (!t) throw new Error("Fant ikke banktransaksjonen");
  if (t.matched) throw new Error("Banktransaksjonen er allerede avstemt");
  const amount = Number(t.amount_ore);
  let entryId: string;
  let voucherNo: number;
  let kind: "invoice_payment" | "new_entry" | "existing_entry";

  if (action.kind === "invoice") {
    if (amount <= 0) throw new Error("Bare innbetalinger kan føres mot kundefakturaer");
    const posted = await insertPayment(tx, company.id, action.invoiceId, t.booking_date, amount);
    ({ id: entryId, voucherNo } = posted);
    kind = "invoice_payment";
  } else if (action.kind === "entry") {
    const [e] = await tx<{ voucher_no: number; bank_ore: string; matched: boolean }[]>`
      SELECT e.voucher_no,
             coalesce((SELECT sum(l.amount_ore) FROM journal_line l WHERE l.entry_id = e.id AND l.account = ${ACCOUNTS.bank}), 0)::text AS bank_ore,
             EXISTS (SELECT 1 FROM bank_match m WHERE m.entry_id = e.id) AS matched
      FROM journal_entry e WHERE e.id = ${action.entryId} AND e.company_id = ${company.id}`;
    if (!e) throw new Error("Fant ikke bilaget");
    if (e.matched) throw new Error(`Bilag ${e.voucher_no} er allerede koblet til en annen banktransaksjon`);
    if (Number(e.bank_ore) !== amount) {
      throw new Error(`Beløpet på bankkontoen i bilag ${e.voucher_no} stemmer ikke med banktransaksjonen`);
    }
    entryId = action.entryId;
    voucherNo = e.voucher_no;
    kind = "existing_entry";
  } else {
    const entry = buildBankEntry(
      {
        date: t.booking_date,
        amountOre: amount,
        account: action.account,
        vatCategory: action.vatCategory ?? null,
        description: action.description?.trim() || t.description,
        documentRef: `bank:${t.bank_ref ?? t.id}`,
      },
      company.vat_registered,
    );
    const posted = await insertEntry(tx, company.id, entry, actor, t.document_id);
    ({ id: entryId, voucherNo } = posted);
    kind = "new_entry";
  }
  await tx`INSERT INTO bank_match (company_id, transaction_id, entry_id, kind, created_by)
           VALUES (${company.id}, ${t.id}, ${entryId}, ${kind}, ${actor})`;
  await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
           VALUES (${company.id}, ${actor}, 'reconcile', 'bank_transaction', ${t.id}, ${tx.json({ kind, entryId, voucherNo })})`;
  return { voucherNo };
}

/** Godkjenner alle forslag med «sikker» treff. */
export async function approveSafeSuggestions(sql: postgres.Sql, company: CompanyRow): Promise<number> {
  return sql.begin(async (tx) => {
    const { suggestions } = await reconciliationSuggestions(tx, company.id);
    let n = 0;
    for (const [txId, s] of suggestions) {
      if (s.confidence !== "sikker") continue;
      await reconcileInTx(tx, company, txId, suggestionToAction(s), "bruker");
      n++;
    }
    return n;
  }) as Promise<number>;
}

export function suggestionToAction(s: Suggestion): MatchAction {
  return s.kind === "invoice" ? { kind: "invoice", invoiceId: s.invoiceId } : { kind: "entry", entryId: s.entryId };
}

/** Fjerner kobling til et eksisterende bilag. Posteringer laget fra banklinjen må reverseres i stedet. */
export async function unmatchTransaction(sql: postgres.Sql, companyId: number, transactionId: string) {
  await sql.begin(async (tx) => {
    const rows = await tx`DELETE FROM bank_match WHERE transaction_id = ${transactionId} AND company_id = ${companyId}
                          AND kind = 'existing_entry' RETURNING entry_id::text`;
    if (rows.length === 0) throw new Error("Bare koblinger til eksisterende bilag kan fjernes. Reverser bilaget i stedet.");
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, 'bruker', 'unreconcile', 'bank_transaction', ${transactionId}, ${tx.json({ entryId: rows[0].entry_id })})`;
  });
}

export interface ReconciliationSummary {
  /** Avstemmingsdato: siste dato med utgående saldo fra banken, ellers siste bankdato. */
  date: string | null;
  startDate: string | null;
  bankBalanceOre: number | null;
  ledgerBalanceOre: number;
  /** Inngående saldo i banken minus saldo i regnskapet dagen før første kontoutskrift. */
  openingDiffOre: number | null;
  unmatchedBankOre: number;
  unmatchedBankCount: number;
  unmatchedLedgerOre: number;
  unmatchedLedgerCount: number;
  unexplainedOre: number | null;
}

/**
 * Bankavstemming: saldo i banken mot saldo på konto 1920 på avstemmingsdatoen.
 * Differansen forklares av ulik inngående saldo og av poster som bare finnes på én side.
 * Det som gjenstår er uforklart og må undersøkes.
 */
export async function reconciliationSummary(sql: postgres.Sql, companyId: number): Promise<ReconciliationSummary> {
  const start = await bankStartDate(sql, companyId);
  const [st] = await sql<{ to_date: string; closing_ore: string }[]>`
    SELECT to_char(to_date, 'YYYY-MM-DD') AS to_date, closing_ore::text FROM bank_statement
    WHERE company_id = ${companyId} AND closing_ore IS NOT NULL AND to_date IS NOT NULL
    ORDER BY to_date DESC, id DESC LIMIT 1`;
  const [first] = await sql<{ opening_ore: string | null }[]>`
    SELECT opening_ore::text FROM bank_statement
    WHERE company_id = ${companyId} AND from_date = ${start ?? "1900-01-01"} AND opening_ore IS NOT NULL
    ORDER BY id LIMIT 1`;
  const [last] = await sql<{ d: string | null }[]>`
    SELECT to_char(max(booking_date), 'YYYY-MM-DD') AS d FROM bank_transaction WHERE company_id = ${companyId}`;
  const date = st?.to_date ?? last?.d ?? null;
  if (!date || !start) {
    return {
      date: null, startDate: null, bankBalanceOre: null, ledgerBalanceOre: 0, openingDiffOre: null,
      unmatchedBankOre: 0, unmatchedBankCount: 0, unmatchedLedgerOre: 0, unmatchedLedgerCount: 0, unexplainedOre: null,
    };
  }
  const [r] = await sql<{ ledger: string; before: string; ub: string; ubn: number; ul: string; uln: number }[]>`
    WITH bank_lines AS (
      SELECT e.id, e.entry_date, sum(l.amount_ore) AS s,
             EXISTS (SELECT 1 FROM bank_match m WHERE m.entry_id = e.id) AS matched
      FROM journal_entry e JOIN journal_line l ON l.entry_id = e.id
      WHERE e.company_id = ${companyId} AND l.account = ${ACCOUNTS.bank} AND e.entry_date <= ${date}
      GROUP BY e.id
    ), open_bank AS (
      SELECT t.amount_ore FROM bank_transaction t
      WHERE t.company_id = ${companyId} AND t.booking_date <= ${date}
        AND NOT EXISTS (SELECT 1 FROM bank_match m WHERE m.transaction_id = t.id)
    )
    SELECT
      (SELECT coalesce(sum(s), 0) FROM bank_lines)::text AS ledger,
      (SELECT coalesce(sum(s), 0) FROM bank_lines WHERE entry_date < ${start} AND NOT matched)::text AS before,
      (SELECT coalesce(sum(amount_ore), 0) FROM open_bank)::text AS ub,
      (SELECT count(*) FROM open_bank)::int AS ubn,
      (SELECT coalesce(sum(s), 0) FROM bank_lines WHERE NOT matched AND s <> 0 AND entry_date >= ${start})::text AS ul,
      (SELECT count(*) FROM bank_lines WHERE NOT matched AND s <> 0 AND entry_date >= ${start})::int AS uln`;
  const bank = st ? Number(st.closing_ore) : null;
  const ledger = Number(r.ledger);
  const ub = Number(r.ub);
  const ul = Number(r.ul);
  const openingDiff = first?.opening_ore != null ? Number(first.opening_ore) - Number(r.before) : null;
  return {
    date,
    startDate: start,
    bankBalanceOre: bank,
    ledgerBalanceOre: ledger,
    openingDiffOre: openingDiff,
    unmatchedBankOre: ub,
    unmatchedBankCount: r.ubn,
    unmatchedLedgerOre: ul,
    unmatchedLedgerCount: r.uln,
    unexplainedOre: bank === null ? null : bank - ledger - ub + ul - (openingDiff ?? 0),
  };
}

export async function listStatements(sql: postgres.Sql, companyId: number) {
  return sql<{ id: string; format: string; filename: string | null; from_date: string | null; to_date: string | null; opening_ore: string | null; closing_ore: string | null; count: number; document_id: string; imported_at: string }[]>`
    SELECT s.id::text, s.format, d.filename, to_char(s.from_date, 'YYYY-MM-DD') AS from_date, to_char(s.to_date, 'YYYY-MM-DD') AS to_date,
           s.opening_ore::text, s.closing_ore::text, s.document_id::text,
           to_char(s.imported_at, 'YYYY-MM-DD HH24:MI') AS imported_at,
           (SELECT count(*)::int FROM bank_transaction t WHERE t.statement_id = s.id) AS count
    FROM bank_statement s JOIN document d ON d.id = s.document_id
    WHERE s.company_id = ${companyId} ORDER BY s.imported_at DESC, s.id DESC LIMIT 50`;
}
