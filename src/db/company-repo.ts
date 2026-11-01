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

/** Programmet er for ett firma: første rad i company er firmaet. */
export async function getCompany(sql: postgres.Sql): Promise<CompanyRow | null> {
  const [row] = await sql<CompanyRow[]>`SELECT * FROM company ORDER BY id LIMIT 1`;
  return row ?? null;
}

export type CompanyInput = Omit<CompanyRow, "id">;

export function validateCompany(c: CompanyInput): string[] {
  const errors: string[] = [];
  if (!c.name.trim()) errors.push("Firmanavn mangler");
  if (!/^\d{9}$/.test(c.org_no)) errors.push("Organisasjonsnummeret må ha 9 siffer");
  if (!c.address.trim() || !c.postal_code.trim() || !c.city.trim()) errors.push("Adresse, postnummer og sted må fylles ut");
  if (!/^\d{11}$/.test(c.bank_account)) errors.push("Kontonummeret må ha 11 siffer");
  return errors;
}

export async function saveCompany(sql: postgres.Sql, c: CompanyInput): Promise<number> {
  return sql.begin(async (tx) => {
    const existing = await tx<{ id: number }[]>`SELECT id FROM company ORDER BY id LIMIT 1`;
    let id: number;
    if (existing[0]) {
      id = existing[0].id;
      await tx`
        UPDATE company SET name = ${c.name}, org_no = ${c.org_no}, address = ${c.address},
          postal_code = ${c.postal_code}, city = ${c.city}, vat_registered = ${c.vat_registered},
          in_business_register = ${c.in_business_register}, bank_account = ${c.bank_account}
        WHERE id = ${id}`;
    } else {
      [{ id }] = await tx<{ id: number }[]>`
        INSERT INTO company (name, org_no, address, postal_code, city, vat_registered, in_business_register, bank_account)
        VALUES (${c.name}, ${c.org_no}, ${c.address}, ${c.postal_code}, ${c.city}, ${c.vat_registered},
                ${c.in_business_register}, ${c.bank_account})
        RETURNING id`;
      await tx`INSERT INTO invoice_number_series (company_id) VALUES (${id})`;
    }
    for (const [no, name] of Object.entries(ACCOUNT_NAMES)) {
      await tx`INSERT INTO account (company_id, number, name) VALUES (${id}, ${no}, ${name}) ON CONFLICT DO NOTHING`;
    }
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${id}, 'bruker', 'save', 'company', ${String(id)}, ${tx.json(c as never)})`;
    return id;
  }) as Promise<number>;
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
