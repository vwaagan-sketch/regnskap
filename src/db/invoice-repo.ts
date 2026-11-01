import type postgres from "postgres";
import { ACCOUNTS } from "@/lib/accounts";
import { calculate, toJournalEntry, validateInvoice, type InvoiceInput, type InvoiceLineInput, type Party } from "@/lib/invoice";
import { makeKid } from "@/lib/kid";
import type { CompanyRow } from "./company-repo";
import { toSeller } from "./company-repo";
import { insertEntry } from "./ledger-repo";

export interface CustomerRow {
  id: number;
  customer_no: number;
  name: string;
  org_no: string | null;
  email: string | null;
  address: string;
  postal_code: string;
  city: string;
}

export async function listCustomers(sql: postgres.Sql, companyId: number) {
  return sql<(CustomerRow & { open_ore: string })[]>`
    SELECT c.id, c.customer_no, c.name, c.org_no, c.email, c.address, c.postal_code, c.city,
      coalesce((SELECT sum(i.gross_ore) FROM invoice i WHERE i.customer_id = c.id), 0)
      - coalesce((SELECT sum(p.amount_ore) FROM invoice_payment p JOIN invoice i ON i.id = p.invoice_id WHERE i.customer_id = c.id), 0)
      AS open_ore
    FROM customer c WHERE c.company_id = ${companyId} ORDER BY c.name`;
}

export type CustomerInput = Omit<CustomerRow, "id" | "customer_no">;

export function validateCustomer(c: CustomerInput): string[] {
  const e: string[] = [];
  if (!c.name.trim()) e.push("Navn mangler");
  if (c.org_no && !/^\d{9}$/.test(c.org_no)) e.push("Organisasjonsnummeret må ha 9 siffer");
  if (!c.address.trim() || !c.postal_code.trim() || !c.city.trim()) e.push("Adresse, postnummer og sted må fylles ut");
  if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) e.push("Ugyldig e-postadresse");
  return e;
}

export async function createCustomer(sql: postgres.Sql, companyId: number, c: CustomerInput): Promise<number> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${companyId}, 2)`;
    const [{ next }] = await tx<{ next: number }[]>`
      SELECT coalesce(max(customer_no), 10000) + 1 AS next FROM customer WHERE company_id = ${companyId}`;
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO customer (company_id, customer_no, name, org_no, email, address, postal_code, city)
      VALUES (${companyId}, ${next}, ${c.name}, ${c.org_no || null}, ${c.email || null}, ${c.address}, ${c.postal_code}, ${c.city})
      RETURNING id`;
    return row.id;
  }) as Promise<number>;
}

export interface IssueInvoiceInput {
  customerId: number;
  issueDate: string;
  dueDate: string;
  deliveryDate: string;
  lines: InvoiceLineInput[];
  kind?: "invoice" | "credit_note";
  creditsInvoiceId?: number;
}

/** Utsteder faktura eller kreditnota: tildeler nummer, lagrer øyeblikksbilde og bokfører i én transaksjon. */
export async function issueInvoice(sql: postgres.Sql, company: CompanyRow, input: IssueInvoiceInput) {
  return sql.begin(async (tx) => {
    const [cust] = await tx<CustomerRow[]>`SELECT * FROM customer WHERE id = ${input.customerId} AND company_id = ${company.id}`;
    if (!cust) throw new Error("Fant ikke kunden");
    let creditsNumber: number | undefined;
    if (input.kind === "credit_note") {
      const [orig] = await tx<{ number: number; kind: string }[]>`
        SELECT number, kind FROM invoice WHERE id = ${input.creditsInvoiceId ?? 0} AND company_id = ${company.id}`;
      if (!orig || orig.kind !== "invoice") throw new Error("Fant ikke fakturaen som skal krediteres");
      creditsNumber = orig.number;
    }
    const [{ next_number: number }] = await tx<{ next_number: number }[]>`
      UPDATE invoice_number_series SET next_number = next_number + 1
      WHERE company_id = ${company.id} RETURNING next_number - 1 AS next_number`;
    const buyer: Party = { name: cust.name, orgNo: cust.org_no ?? undefined, address: cust.address, postalCode: cust.postal_code, city: cust.city };
    const kind = input.kind ?? "invoice";
    const inv: InvoiceInput = {
      kind,
      number,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      deliveryDate: input.deliveryDate,
      seller: toSeller(company),
      buyer,
      lines: input.lines,
      kid: kind === "invoice" ? makeKid(cust.customer_no, number) : undefined,
      creditsInvoiceNumber: creditsNumber,
    };
    const errors = validateInvoice(inv);
    if (errors.length) throw new Error(errors.join(". "));
    const totals = calculate(inv);
    if (kind === "invoice" && totals.grossOre <= 0) throw new Error("Fakturabeløpet må være større enn 0");
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO invoice (company_id, kind, number, customer_id, issue_date, due_date, delivery_date, kid,
                           credits_invoice_id, net_ore, vat_ore, gross_ore, snapshot)
      VALUES (${company.id}, ${kind}, ${number}, ${cust.id}, ${inv.issueDate}, ${inv.dueDate}, ${inv.deliveryDate},
              ${inv.kid ?? null}, ${input.creditsInvoiceId ?? null}, ${totals.netOre}, ${totals.vatOre}, ${totals.grossOre},
              ${tx.json({ invoice: inv, totals, customerNo: cust.customer_no, customerEmail: cust.email } as never)})
      RETURNING id`;
    const entry = toJournalEntry(inv);
    const posted = await insertEntry(tx, company.id, entry, "bruker");
    if (kind === "credit_note" && input.creditsInvoiceId) {
      // Kreditnotaen gjør opp originalfakturaen i reskontroen.
      await tx`INSERT INTO invoice_payment (company_id, invoice_id, paid_date, amount_ore, entry_id)
               VALUES (${company.id}, ${input.creditsInvoiceId}, ${inv.issueDate}, ${-totals.grossOre}, ${posted.id})`;
    }
    return { id: row.id, number, voucherNo: posted.voucherNo };
  });
}

export interface InvoiceListItem {
  id: number;
  kind: "invoice" | "credit_note";
  number: number;
  customer_name: string;
  issue_date: string;
  due_date: string;
  gross_ore: string;
  paid_ore: string;
}

export async function listInvoices(sql: postgres.Sql, companyId: number) {
  return sql<InvoiceListItem[]>`
    SELECT i.id, i.kind, i.number, c.name AS customer_name,
      to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
      i.gross_ore::text, coalesce(sum(p.amount_ore), 0)::text AS paid_ore
    FROM invoice i JOIN customer c ON c.id = i.customer_id
    LEFT JOIN invoice_payment p ON p.invoice_id = i.id
    WHERE i.company_id = ${companyId}
    GROUP BY i.id, c.name ORDER BY i.number DESC`;
}

export async function getInvoice(sql: postgres.Sql, companyId: number, id: number) {
  const [row] = await sql<{
    id: number; kind: "invoice" | "credit_note"; number: number; snapshot: { invoice: InvoiceInput; totals: ReturnType<typeof calculate>; customerNo: number; customerEmail: string | null };
    paid_ore: string; credited_by: number | null; issued_at: string;
  }[]>`
    SELECT i.id, i.kind, i.number, i.snapshot, to_char(i.issued_at, 'YYYY-MM-DD HH24:MI') AS issued_at,
      coalesce((SELECT sum(amount_ore) FROM invoice_payment WHERE invoice_id = i.id), 0)::text AS paid_ore,
      (SELECT number FROM invoice c WHERE c.credits_invoice_id = i.id LIMIT 1) AS credited_by
    FROM invoice i WHERE i.id = ${id} AND i.company_id = ${companyId}`;
  return row ?? null;
}

export async function getPayments(sql: postgres.Sql, invoiceId: number) {
  return sql<{ paid_date: string; amount_ore: string; voucher_no: number }[]>`
    SELECT to_char(p.paid_date, 'YYYY-MM-DD') AS paid_date, p.amount_ore::text, e.voucher_no
    FROM invoice_payment p JOIN journal_entry e ON e.id = p.entry_id
    WHERE p.invoice_id = ${invoiceId} ORDER BY p.id`;
}

/** Registrerer innbetaling: debet bank, kredit kundefordringer. */
export async function registerPayment(sql: postgres.Sql, companyId: number, invoiceId: number, date: string, amountOre: number) {
  return sql.begin(async (tx) => {
    const [inv] = await tx<{ number: number; gross_ore: string; kind: string; customer: string }[]>`
      SELECT i.number, i.gross_ore::text, i.kind, c.name AS customer FROM invoice i JOIN customer c ON c.id = i.customer_id
      WHERE i.id = ${invoiceId} AND i.company_id = ${companyId}`;
    if (!inv || inv.kind !== "invoice") throw new Error("Fant ikke fakturaen");
    const [{ paid }] = await tx<{ paid: string }[]>`SELECT coalesce(sum(amount_ore), 0)::text AS paid FROM invoice_payment WHERE invoice_id = ${invoiceId}`;
    const open = Number(inv.gross_ore) - Number(paid);
    if (amountOre <= 0) throw new Error("Beløpet må være større enn 0");
    if (amountOre > open) throw new Error("Beløpet er større enn det som står åpent på fakturaen");
    const posted = await insertEntry(tx, companyId, {
      date,
      description: `Innbetaling faktura ${inv.number} ${inv.customer}`,
      documentRef: `innbetaling:${inv.number}`,
      lines: [
        { account: ACCOUNTS.bank, amount: amountOre },
        { account: ACCOUNTS.customerReceivables, amount: -amountOre, description: inv.customer },
      ],
    }, "bruker");
    await tx`INSERT INTO invoice_payment (company_id, invoice_id, paid_date, amount_ore, entry_id)
             VALUES (${companyId}, ${invoiceId}, ${date}, ${amountOre}, ${posted.id})`;
    return posted;
  });
}
