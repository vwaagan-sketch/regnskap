/**
 * SAF-T Financial (Norge), versjon 1.30.
 * Skatteetaten kan kreve regnskapet utlevert i dette formatet ved kontroll (bokføringsforskriften § 7-8).
 * Elementrekkefølgen følger XSD-en "Norwegian_SAF-T_Financial_Schema_v_1.30".
 */
import { amount, el, XML_DECL, type XmlNode } from "./xml";
import { VAT_CODES, isVatAccount } from "./vat-report";

export interface SaftParty {
  name: string;
  orgNo?: string | null;
  address: string;
  postalCode: string;
  city: string;
}

export interface SaftInput {
  company: SaftParty & { orgNo: string; vatRegistered: boolean; bankAccount: string; contactName: string };
  year: number;
  fromMonth: number;
  toMonth: number;
  createdDate: string;
  software: { company: string; id: string; version: string };
  accounts: { number: string; name: string; openingOre: number; closingOre: number }[];
  customers: (SaftParty & { customerNo: number; openingOre: number; closingOre: number })[];
  entries: {
    voucherNo: number;
    date: string;
    systemDate: string;
    description: string;
    lines: { account: string; amountOre: number; vatCode: string | null; description: string | null; customerNo?: number | null }[];
  }[];
}

const NS = "urn:StandardAuditFile-Taxation-Financial:NO";

function address(p: SaftParty, tag = "Address"): string {
  return el(tag, [
    el("StreetName", p.address || "Ukjent"),
    el("City", p.city || "Ukjent"),
    el("PostalCode", p.postalCode || "0000"),
    el("Country", "NO"),
  ]);
}

/** Debet- eller kreditsaldo: positivt beløp på riktig side, null på den andre utelates. */
function balance(prefix: "Opening" | "Closing", ore: number): string {
  return ore >= 0 ? el(`${prefix}DebitBalance`, amount(ore)) : el(`${prefix}CreditBalance`, amount(-ore));
}

function contact(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : "-";
  return el("Contact", [el("ContactPerson", [el("FirstName", parts.join(" ") || "-"), el("LastName", last)])]);
}

export function buildSaft(input: SaftInput): string {
  const c = input.company;
  const totalDebit = input.entries.reduce((s, e) => s + e.lines.filter((l) => l.amountOre > 0).reduce((t, l) => t + l.amountOre, 0), 0);
  const totalCredit = input.entries.reduce((s, e) => s + e.lines.filter((l) => l.amountOre < 0).reduce((t, l) => t - l.amountOre, 0), 0);
  const usedCodes = new Set(input.entries.flatMap((e) => e.lines.map((l) => l.vatCode).filter(Boolean) as string[]));

  const header = el("Header", [
    el("AuditFileVersion", "1.30"),
    el("AuditFileCountry", "NO"),
    el("AuditFileDateCreated", input.createdDate),
    el("SoftwareCompanyName", input.software.company),
    el("SoftwareID", input.software.id),
    el("SoftwareVersion", input.software.version),
    el("Company", [
      el("RegistrationNumber", c.orgNo),
      el("Name", c.name),
      address(c),
      contact(c.contactName),
      c.vatRegistered && el("TaxRegistration", [
        el("TaxRegistrationNumber", `${c.orgNo}MVA`),
        el("TaxAuthority", "Skatteetaten"),
      ]),
      c.bankAccount && el("BankAccount", [el("BankAccountNumber", c.bankAccount)]),
    ]),
    el("DefaultCurrencyCode", "NOK"),
    el("SelectionCriteria", [
      el("PeriodStart", input.fromMonth),
      el("PeriodStartYear", input.year),
      el("PeriodEnd", input.toMonth),
      el("PeriodEndYear", input.year),
    ]),
    el("TaxAccountingBasis", "A"),
  ]);

  const accounts = el("GeneralLedgerAccounts", input.accounts.map((a) =>
    el("Account", [
      el("AccountID", a.number),
      el("AccountDescription", a.name),
      el("StandardAccountID", a.number.slice(0, 2)),
      el("AccountType", "GL"),
      balance("Opening", a.openingOre),
      balance("Closing", a.closingOre),
    ])));

  const customers = input.customers.length > 0 && el("Customers", input.customers.map((cu) =>
    el("Customer", [
      cu.orgNo ? el("RegistrationNumber", cu.orgNo) : null,
      el("Name", cu.name),
      address(cu),
      el("CustomerID", cu.customerNo),
      el("AccountID", "1500"),
      balance("Opening", cu.openingOre),
      balance("Closing", cu.closingOre),
    ])));

  const codes = Object.entries(VAT_CODES).filter(([code]) => usedCodes.has(code) || ["1", "3"].includes(code));
  const taxTable = el("TaxTable", [el("TaxTableEntry", [
    el("TaxType", "MVA"),
    el("Description", "Merverdiavgift"),
    codes.map(([code, d]) => el("TaxCodeDetails", [
      el("TaxCode", code),
      el("Description", d.label),
      el("TaxPercentage", d.rate.toFixed(2)),
      el("Country", "NO"),
      el("StandardTaxCode", code),
      el("BaseRate", 100),
    ])),
  ])]);

  const transactions: XmlNode[] = input.entries.map((e) => {
    let record = 0;
    return el("Transaction", [
      el("TransactionID", e.voucherNo),
      el("Period", Number(e.date.slice(5, 7))),
      el("PeriodYear", Number(e.date.slice(0, 4))),
      el("TransactionDate", e.date),
      el("Description", e.description),
      el("SystemEntryDate", e.systemDate),
      el("GLPostingDate", e.date),
      e.lines.map((l) => {
        record += 1;
        const code = l.vatCode && VAT_CODES[l.vatCode] ? l.vatCode : null;
        const side = l.amountOre >= 0 ? "DebitAmount" : "CreditAmount";
        let tax: string | null = null;
        if (code) {
          const d = VAT_CODES[code];
          const isVat = isVatAccount(l.account);
          tax = el("TaxInformation", [
            el("TaxType", "MVA"),
            el("TaxCode", code),
            el("TaxPercentage", d.rate.toFixed(2)),
            isVat ? null : el("TaxBase", amount(Math.abs(l.amountOre))),
            el("TaxAmount", [el("Amount", amount(isVat ? Math.abs(l.amountOre) : Math.round((Math.abs(l.amountOre) * d.rate) / 100)))]),
          ]);
        }
        return el("Line", [
          el("RecordID", record),
          el("AccountID", l.account),
          l.customerNo ? el("CustomerID", l.customerNo) : null,
          el("Description", l.description || e.description),
          el(side, [el("Amount", amount(Math.abs(l.amountOre)))]),
          tax,
        ]);
      }),
    ]);
  });

  const gl = el("GeneralLedgerEntries", [
    el("NumberOfEntries", input.entries.length),
    el("TotalDebit", amount(totalDebit)),
    el("TotalCredit", amount(totalCredit)),
    input.entries.length > 0 && el("Journal", [
      el("JournalID", "GL"),
      el("Description", "Hovedbok"),
      el("Type", "GL"),
      transactions,
    ]),
  ]);

  return XML_DECL + el("AuditFile", [header, el("MasterFiles", [accounts, customers, taxTable]), gl], { xmlns: NS });
}
