import { ACCOUNTS, ACCOUNT_NAMES } from "../accounts";
import type { JournalEntryDraft, JournalLine } from "../ledger";
import { validateEntry } from "../ledger";
import { INPUT_VAT_CODE } from "../vat";

export interface ReceiptVatLine {
  ratePercent: number;
  baseOre: number;
  vatOre: number;
}

export interface ReceiptBooking {
  date: string;
  supplierName: string;
  supplierOrgNo?: string | null;
  documentNumber?: string | null;
  description: string;
  expenseAccount: string;
  totalOre: number;
  vatLines: ReceiptVatLine[];
  /** true = betalt (kort/bank), false = ubetalt regning (leverandørgjeld) */
  paid: boolean;
}

const RATE_TO_CATEGORY: Record<number, keyof typeof INPUT_VAT_CODE | undefined> = {
  25: "high",
  15: "medium",
  12: "low",
};

/** Maks avvik i øre som føres som øreavrunding på kostnadskontoen. */
export const MAX_ROUNDING_ORE = 100;

export const EXPENSE_ACCOUNTS = Object.keys(ACCOUNT_NAMES).filter((a) => a >= "4000" && a < "8000");
/** Kostnadskonto: 4000–7999 (varekost, lønn og andre driftskostnader). */
export const isExpenseAccount = (a: string) => /^[4-7]\d{3}$/.test(a);

export function validateReceiptBooking(r: ReceiptBooking): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) errors.push("Dato mangler eller er ugyldig");
  if (!r.supplierName.trim()) errors.push("Leverandør mangler");
  if (!r.description.trim()) errors.push("Beskrivelse mangler");
  if (!isExpenseAccount(r.expenseAccount)) errors.push("Velg en gyldig kostnadskonto");
  if (!Number.isSafeInteger(r.totalOre) || r.totalOre <= 0) errors.push("Totalbeløpet må være større enn 0");
  for (const l of r.vatLines) {
    if (![25, 15, 12, 0].includes(l.ratePercent)) errors.push(`Ukjent MVA-sats ${l.ratePercent} %`);
    if (!Number.isSafeInteger(l.baseOre) || !Number.isSafeInteger(l.vatOre)) errors.push("MVA-beløp må være i hele øre");
  }
  const sum = r.vatLines.reduce((s, l) => s + l.baseOre + l.vatOre, 0);
  if (r.vatLines.length > 0 && Math.abs(sum - r.totalOre) > MAX_ROUNDING_ORE) {
    errors.push("Summen av grunnlag og MVA stemmer ikke med totalbeløpet");
  }
  return errors;
}

/**
 * Lager posteringen for en kjøpt vare/tjeneste:
 * debet kostnad (+ inngående MVA ved fradragsrett), kredit bank eller leverandørgjeld.
 */
export function buildReceiptEntry(r: ReceiptBooking, vatRegistered: boolean): JournalEntryDraft {
  const errors = validateReceiptBooking(r);
  if (errors.length) throw new Error(errors.join(". "));

  const lines: JournalLine[] = [];
  const label = r.supplierName.trim();
  if (r.vatLines.length === 0) {
    lines.push({ account: r.expenseAccount, amount: r.totalOre, description: label });
  }
  for (const l of r.vatLines) {
    const cat = RATE_TO_CATEGORY[l.ratePercent];
    if (vatRegistered && cat && l.vatOre !== 0) {
      const code = INPUT_VAT_CODE[cat];
      lines.push({ account: r.expenseAccount, amount: l.baseOre, vatCode: code, description: label });
      lines.push({ account: ACCOUNTS.inputVat, amount: l.vatOre, vatCode: code, description: `Inngående MVA ${l.ratePercent} %` });
    } else {
      lines.push({ account: r.expenseAccount, amount: l.baseOre + l.vatOre, description: label });
    }
  }
  const debit = lines.reduce((s, l) => s + l.amount, 0);
  const diff = r.totalOre - debit;
  if (diff !== 0) {
    lines.push({ account: r.expenseAccount, amount: diff, description: "Øreavrunding" });
  }
  lines.push({
    account: r.paid ? ACCOUNTS.bank : ACCOUNTS.supplierPayables,
    amount: -r.totalOre,
    description: label,
  });

  const merged = lines.filter((l) => l.amount !== 0);
  const entry: JournalEntryDraft = {
    date: r.date,
    description: `${label}: ${r.description.trim()}`,
    documentRef: `kjøp:${r.documentNumber?.trim() || r.date}`,
    lines: merged,
  };
  validateEntry(entry);
  return entry;
}
