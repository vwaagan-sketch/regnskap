import type postgres from "postgres";
import type { CompanyRow } from "./company-repo";
import { accountBalances, customerBalances, entriesInPeriod } from "./report-repo";
import { buildSaft } from "@/lib/saft";
import { today } from "@/lib/http";

export const SOFTWARE = { company: "Regnskap", id: "regnskap", version: "0.2.0" };

const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export async function exportSaft(
  sql: postgres.Sql,
  company: CompanyRow,
  opts: { year: number; fromMonth?: number; toMonth?: number; contactName: string },
): Promise<string> {
  const fromMonth = opts.fromMonth ?? 1;
  const toMonth = opts.toMonth ?? 12;
  const from = `${opts.year}-${String(fromMonth).padStart(2, "0")}-01`;
  const to = `${opts.year}-${String(toMonth).padStart(2, "0")}-${lastDay(opts.year, toMonth)}`;
  const [accounts, customers, entries] = await Promise.all([
    accountBalances(sql, company.id, from, to),
    customerBalances(sql, company.id, from, to),
    entriesInPeriod(sql, company.id, from, to),
  ]);
  return buildSaft({
    company: {
      name: company.name, orgNo: company.org_no, address: company.address, postalCode: company.postal_code, city: company.city,
      vatRegistered: company.vat_registered, bankAccount: company.bank_account, contactName: opts.contactName,
    },
    year: opts.year,
    fromMonth,
    toMonth,
    createdDate: today(),
    software: SOFTWARE,
    accounts: accounts.map((a) => ({ number: a.number, name: a.name, openingOre: a.openingOre, closingOre: a.closingOre })),
    customers: customers.map((c) => ({
      customerNo: c.customerNo, name: c.name, orgNo: c.orgNo, address: c.address, postalCode: c.postalCode, city: c.city,
      openingOre: c.openingOre, closingOre: c.closingOre,
    })),
    entries: entries.map((e) => ({ voucherNo: e.voucherNo, date: e.date, systemDate: e.systemDate, description: e.description, lines: e.lines })),
  });
}

/** Skatteetatens navnekonvensjon: SAF-T Financial_<orgnr>_<tidsstempel>_<n>_<av>.xml */
export const saftFilename = (orgNo: string) => `SAF-T Financial_${orgNo}_${today().replace(/-/g, "")}000000_1_1.xml`;
