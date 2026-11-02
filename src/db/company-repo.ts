import type postgres from "postgres";
import { ACCOUNT_NAMES } from "@/lib/accounts";
import type { Seller } from "@/lib/invoice";

export interface CompanyRow {
  id: number;
  name: string;
  org_no: string;
  address: string;
  postal_code: string;
  city: string;
  vat_registered: boolean;
  in_business_register: boolean;
  bank_account: string;
}

export async function getCompanyById(sql: postgres.Sql, id: number): Promise<CompanyRow | null> {
  const [row] = await sql<CompanyRow[]>`SELECT * FROM company WHERE id = ${id}`;
  return row ?? null;
}

export type CompanyInput = Omit<CompanyRow, "id">;

/** Leser firmaopplysninger fra skjemaet. Brukes også av registreringen. */
export function companyFromForm(form: FormData): CompanyInput {
  const digits = (k: string) => String(form.get(k) ?? "").replace(/\D/g, "");
  const text = (k: string) => String(form.get(k) ?? "").trim();
  return {
    name: text("name"),
    org_no: digits("org_no"),
    address: text("address"),
    postal_code: text("postal_code"),
    city: text("city"),
    bank_account: digits("bank_account"),
    vat_registered: form.get("vat_registered") === "on",
    in_business_register: form.get("in_business_register") === "on",
  };
}

export function validateCompany(c: CompanyInput): string[] {
  const errors: string[] = [];
  if (!c.name.trim()) errors.push("Firmanavn mangler");
  if (!/^\d{9}$/.test(c.org_no)) errors.push("Organisasjonsnummeret må ha 9 siffer");
  if (!c.address.trim() || !c.postal_code.trim() || !c.city.trim()) errors.push("Adresse, postnummer og sted må fylles ut");
  if (!/^\d{11}$/.test(c.bank_account)) errors.push("Kontonummeret må ha 11 siffer");
  return errors;
}

export class DuplicateCompanyError extends Error {
  constructor() {
    super("Et firma med dette organisasjonsnummeret er allerede registrert. Be en administrator i firmaet om en invitasjon.");
  }
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

/** Oppretter et nytt firma med kontoplan og fakturanummerserie. Kjøres i en pågående transaksjon. */
export async function createCompany(tx: postgres.TransactionSql, c: CompanyInput, actor: string): Promise<number> {
  const existing = await tx`SELECT 1 FROM company WHERE org_no = ${c.org_no}`;
  if (existing.length) throw new DuplicateCompanyError();
  let id: number;
  try {
    [{ id }] = await tx<{ id: number }[]>`
      INSERT INTO company (name, org_no, address, postal_code, city, vat_registered, in_business_register, bank_account)
      VALUES (${c.name}, ${c.org_no}, ${c.address}, ${c.postal_code}, ${c.city}, ${c.vat_registered},
              ${c.in_business_register}, ${c.bank_account})
      RETURNING id`;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicateCompanyError();
    throw e;
  }
  await tx`INSERT INTO invoice_number_series (company_id) VALUES (${id})`;
  for (const [no, name] of Object.entries(ACCOUNT_NAMES)) {
    await tx`INSERT INTO account (company_id, number, name) VALUES (${id}, ${no}, ${name}) ON CONFLICT DO NOTHING`;
  }
  await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
           VALUES (${id}, ${actor}, 'create', 'company', ${String(id)}, ${tx.json(c as never)})`;
  return id;
}

/** Oppdaterer opplysningene for et eksisterende firma. */
export async function updateCompany(sql: postgres.Sql, id: number, c: CompanyInput, actor: string): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await tx`
        UPDATE company SET name = ${c.name}, org_no = ${c.org_no}, address = ${c.address},
          postal_code = ${c.postal_code}, city = ${c.city}, vat_registered = ${c.vat_registered},
          in_business_register = ${c.in_business_register}, bank_account = ${c.bank_account}
        WHERE id = ${id}`;
      await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
               VALUES (${id}, ${actor}, 'update', 'company', ${String(id)}, ${tx.json(c as never)})`;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DuplicateCompanyError();
    throw e;
  }
}

export function toSeller(c: CompanyRow): Seller {
  return {
    name: c.name,
    orgNo: c.org_no,
    address: c.address,
    postalCode: c.postal_code,
    city: c.city,
    vatRegistered: c.vat_registered,
    inBusinessRegister: c.in_business_register,
    bankAccount: c.bank_account,
  };
}
