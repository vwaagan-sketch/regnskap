import type postgres from "postgres";
import type { VatCategory } from "@/lib/vat";

export interface AccountRow {
  number: string;
  name: string;
  vat_category: VatCategory | null;
  active: boolean;
  custom: boolean;
  used: boolean;
  balance_ore: string;
}

export async function listAccounts(sql: postgres.Sql, companyId: number, opts: { onlyActive?: boolean } = {}) {
  return sql<AccountRow[]>`
    SELECT a.number, a.name, a.vat_category, a.active, a.custom,
      EXISTS (SELECT 1 FROM journal_line l WHERE l.company_id = a.company_id AND l.account = a.number) AS used,
      coalesce((SELECT sum(amount_ore) FROM journal_line l WHERE l.company_id = a.company_id AND l.account = a.number), 0)::text AS balance_ore
    FROM account a
    WHERE a.company_id = ${companyId} ${opts.onlyActive ? sql`AND a.active` : sql``}
    ORDER BY a.number`;
}

export interface AccountInput {
  number: string;
  name: string;
  vat_category: VatCategory | null;
}

/** Kontoklasser i NS 4102. Klasse 9 brukes ikke i finansregnskapet. */
export const ACCOUNT_CLASSES: Record<string, string> = {
  "1": "Eiendeler",
  "2": "Egenkapital og gjeld",
  "3": "Salgs- og driftsinntekter",
  "4": "Varekostnad",
  "5": "Lønnskostnad",
  "6": "Andre driftskostnader",
  "7": "Andre driftskostnader",
  "8": "Finans og skatt",
};

export function validateAccount(a: AccountInput): string[] {
  const e: string[] = [];
  if (!/^[1-8]\d{3}$/.test(a.number)) e.push("Kontonummeret må ha fire siffer og starte med 1–8");
  if (!a.name.trim()) e.push("Kontonavn mangler");
  if (a.name.length > 80) e.push("Kontonavnet er for langt");
  if (a.vat_category && !(a.number >= "3000" && a.number < "8000")) {
    e.push("Standard MVA kan bare settes på inntekts- og kostnadskontoer (3000–7999)");
  }
  return e;
}

export async function createAccount(sql: postgres.Sql, companyId: number, a: AccountInput) {
  const errors = validateAccount(a);
  if (errors.length) throw new Error(errors.join(". "));
  const exists = await sql`SELECT 1 FROM account WHERE company_id = ${companyId} AND number = ${a.number}`;
  if (exists.length) throw new Error(`Konto ${a.number} finnes allerede`);
  await sql`INSERT INTO account (company_id, number, name, vat_category, custom)
            VALUES (${companyId}, ${a.number}, ${a.name.trim()}, ${a.vat_category}, true)`;
  await sql`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
            VALUES (${companyId}, 'bruker', 'create', 'account', ${a.number}, ${sql.json(a as never)})`;
}

export async function updateAccount(sql: postgres.Sql, companyId: number, number: string, patch: { name: string; vat_category: VatCategory | null; active: boolean }) {
  const rows = await sql`UPDATE account SET name = ${patch.name.trim()}, vat_category = ${patch.vat_category}, active = ${patch.active}
            WHERE company_id = ${companyId} AND number = ${number} RETURNING number`;
  if (!rows.length) throw new Error("Fant ikke kontoen");
  await sql`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
            VALUES (${companyId}, 'bruker', 'update', 'account', ${number}, ${sql.json(patch as never)})`;
}
