import { redirect } from "next/navigation";
import type postgres from "postgres";
import { getSql } from "./client";
import { getCompany, type CompanyRow } from "./company-repo";

export interface AppContext {
  sql: postgres.Sql;
  company: CompanyRow;
}

/** Krever database og registrert firma. Sender brukeren til firmaoppsett ellers. */
export async function requireContext(): Promise<AppContext> {
  const sql = getSql();
  if (!sql) redirect("/firma");
  const company = await getCompany(sql);
  if (!company) redirect("/firma");
  return { sql, company };
}

/** Variant for API-ruter: kaster feil i stedet for å sende videre. */
export async function apiContext(): Promise<AppContext> {
  const sql = getSql();
  if (!sql) throw new Error("Databasen er ikke koblet til. Legg inn DATABASE_URL i miljøvariablene.");
  const company = await getCompany(sql);
  if (!company) throw new Error("Registrer firmaet ditt under Firma først.");
  return { sql, company };
}
