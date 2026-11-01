import { ACCOUNTS } from "./accounts";
import type { JournalEntryDraft, JournalLine } from "./ledger";
import { validateEntry } from "./ledger";
import { OUTPUT_VAT_CODE, VatCategory, vatOf } from "./vat";

export interface Party {
  name: string;
  orgNo?: string; // 9 siffer
  address: string;
  postalCode: string;
  city: string;
}

export interface Seller extends Party {
  orgNo: string;
  vatRegistered: boolean;
  /** Registrert i Foretaksregisteret (AS m.fl.) - skal vises på fakturaen. */
  inBusinessRegister: boolean;
  bankAccount: string;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number; // kan ha desimaler, f.eks. 1.5 timer
  unitPriceOre: number; // eks. MVA
  vatCategory: VatCategory;
}

export interface InvoiceInput {
  kind: "invoice" | "credit_note";
  number: number;
  issueDate: string;
  dueDate: string;
  deliveryDate: string;
  deliveryPlace?: string;
  seller: Seller;
  buyer: Party;
  lines: InvoiceLineInput[];
  kid?: string;
  /** Kreditnota: fakturanummeret som krediteres. */
  creditsInvoiceNumber?: number;
}

export interface CalculatedLine extends InvoiceLineInput {
  netOre: number;
  vatOre: number;
}

export interface InvoiceTotals {
  lines: CalculatedLine[];
  netOre: number;
  vatOre: number;
  grossOre: number;
  vatByCategory: Partial<Record<VatCategory, { baseOre: number; vatOre: number }>>;
}

export function calculate(input: InvoiceInput): InvoiceTotals {
  const sign = input.kind === "credit_note" ? -1 : 1;
  const vatByCategory: InvoiceTotals["vatByCategory"] = {};
  const lines = input.lines.map((l) => {
    const netOre = sign * Math.round(l.quantity * l.unitPriceOre);
    const category: VatCategory = input.seller.vatRegistered ? l.vatCategory : "exempt";
    const bucket = (vatByCategory[category] ??= { baseOre: 0, vatOre: 0 });
    bucket.baseOre += netOre;
    return { ...l, vatCategory: category, netOre, vatOre: 0 };
  });
  // MVA beregnes per sats på summen, deretter fordeles på linjene for visning.
  for (const [cat, bucket] of Object.entries(vatByCategory) as [VatCategory, { baseOre: number; vatOre: number }][]) {
    bucket.vatOre = vatOf(bucket.baseOre, cat);
  }
  for (const line of lines) line.vatOre = vatOf(line.netOre, line.vatCategory);
  const netOre = lines.reduce((s, l) => s + l.netOre, 0);
  const vatOre = Object.values(vatByCategory).reduce((s, b) => s + (b?.vatOre ?? 0), 0);
  return { lines, netOre, vatOre, grossOre: netOre + vatOre, vatByCategory };
}

/** Sjekker pliktige opplysninger etter bokføringsforskriften § 5-1-1 m.fl. */
export function validateInvoice(input: InvoiceInput): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(input.number) || input.number <= 0) errors.push("Mangler gyldig fakturanummer");
  if (!input.issueDate) errors.push("Mangler fakturadato");
  if (!input.dueDate) errors.push("Mangler betalingsfrist");
  if (input.dueDate < input.issueDate) errors.push("Forfallsdato er før fakturadato");
  if (!input.deliveryDate) errors.push("Mangler leveringstidspunkt");
  if (!/^\d{9}$/.test(input.seller.orgNo)) errors.push("Selgers organisasjonsnummer må ha 9 siffer");
  if (!input.seller.name || !input.seller.address) errors.push("Mangler selgers navn eller adresse");
  if (!input.buyer.name || !input.buyer.address) errors.push("Mangler kjøpers navn eller adresse");
  if (input.buyer.orgNo && !/^\d{9}$/.test(input.buyer.orgNo)) errors.push("Kjøpers organisasjonsnummer må ha 9 siffer");
  if (input.lines.length === 0) errors.push("Fakturaen har ingen linjer");
  input.lines.forEach((l, i) => {
    if (!l.description.trim()) errors.push(`Linje ${i + 1}: mangler beskrivelse av ytelsen`);
    if (!(l.quantity > 0)) errors.push(`Linje ${i + 1}: antall må være større enn 0`);
    if (!Number.isSafeInteger(l.unitPriceOre)) errors.push(`Linje ${i + 1}: pris må være i hele øre`);
  });
  if (input.kind === "credit_note" && !input.creditsInvoiceNumber) {
    errors.push("Kreditnota må vise til fakturaen som krediteres");
  }
  return errors;
}

/** Selgers identifikasjon slik den skal stå på fakturaen. */
export function sellerIdLine(seller: Seller): string {
  const org = seller.orgNo.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  return [
    `Org.nr. ${org}${seller.vatRegistered ? " MVA" : ""}`,
    seller.inBusinessRegister ? "Foretaksregisteret" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

const OUTPUT_VAT_ACCOUNT: Record<VatCategory, string | null> = {
  high: ACCOUNTS.outputVatHigh,
  medium: ACCOUNTS.outputVatMedium,
  low: ACCOUNTS.outputVatLow,
  zero: null,
  exempt: null,
};

/** Lager bokføringsposteringen for en faktura eller kreditnota. */
export function toJournalEntry(input: InvoiceInput): JournalEntryDraft {
  const totals = calculate(input);
  const lines: JournalLine[] = [
    { account: ACCOUNTS.customerReceivables, amount: totals.grossOre, description: input.buyer.name },
  ];
  for (const [cat, bucket] of Object.entries(totals.vatByCategory) as [VatCategory, { baseOre: number; vatOre: number }][]) {
    if (bucket.baseOre === 0) continue;
    const revenueAccount = cat === "zero" || cat === "exempt" ? ACCOUNTS.salesExempt : ACCOUNTS.salesTaxable;
    lines.push({ account: revenueAccount, amount: -bucket.baseOre, vatCode: OUTPUT_VAT_CODE[cat] });
    const vatAccount = OUTPUT_VAT_ACCOUNT[cat];
    if (vatAccount && bucket.vatOre !== 0) {
      lines.push({ account: vatAccount, amount: -bucket.vatOre, vatCode: OUTPUT_VAT_CODE[cat] });
    }
  }
  const label = input.kind === "credit_note" ? "Kreditnota" : "Faktura";
  const entry: JournalEntryDraft = {
    date: input.issueDate,
    description: `${label} ${input.number} ${input.buyer.name}`,
    documentRef: `${input.kind}:${input.number}`,
    lines,
  };
  validateEntry(entry);
  return entry;
}
