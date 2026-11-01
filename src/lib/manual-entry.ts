import { ACCOUNTS } from "./accounts";
import type { JournalEntryDraft, JournalLine } from "./ledger";
import { validateEntry } from "./ledger";
import { INPUT_VAT_CODE, OUTPUT_VAT_CODE, type VatCategory } from "./vat";

/**
 * Manuelt bilag (fri postering). Hver linje har enten debet eller kredit.
 * Har linjen en MVA-sats, er beløpet inkl. MVA og systemet lager MVA-linjen selv:
 * inntektskonti (3xxx) gir utgående MVA, kostnadskonti (4xxx–7xxx) gir inngående MVA.
 */
export interface ManualLineInput {
  account: string;
  debitOre: number;
  creditOre: number;
  vatCategory?: "high" | "medium" | "low" | null;
  description?: string;
}

export interface ManualEntryInput {
  date: string;
  description: string;
  documentRef?: string;
  lines: ManualLineInput[];
}

const RATE: Record<"high" | "medium" | "low", number> = { high: 25, medium: 15, low: 12 };
const OUTPUT_ACCOUNT: Record<"high" | "medium" | "low", string> = {
  high: ACCOUNTS.outputVatHigh,
  medium: ACCOUNTS.outputVatMedium,
  low: ACCOUNTS.outputVatLow,
};

export function vatSide(account: string): "output" | "input" | null {
  if (account >= "3000" && account < "4000") return "output";
  if (account >= "4000" && account < "8000") return "input";
  return null;
}

/** Deler et beløp inkl. MVA i netto og MVA. */
export function splitGross(grossOre: number, cat: "high" | "medium" | "low"): { net: number; vat: number } {
  const rate = RATE[cat];
  const net = Math.sign(grossOre) * Math.round((Math.abs(grossOre) * 100) / (100 + rate));
  return { net, vat: grossOre - net };
}

export function buildManualEntry(input: ManualEntryInput, vatRegistered: boolean): JournalEntryDraft {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.push("Dato mangler eller er ugyldig");
  if (!input.description.trim()) errors.push("Beskrivelse mangler");
  const lines: JournalLine[] = [];
  input.lines.forEach((l, i) => {
    const n = i + 1;
    if (!/^\d{4}$/.test(l.account)) errors.push(`Linje ${n}: velg konto`);
    if (l.debitOre < 0 || l.creditOre < 0) errors.push(`Linje ${n}: beløp kan ikke være negative`);
    if ((l.debitOre > 0) === (l.creditOre > 0)) errors.push(`Linje ${n}: fyll ut enten debet eller kredit`);
    const amount = l.debitOre - l.creditOre;
    const side = vatSide(l.account);
    if (l.vatCategory && !side) errors.push(`Linje ${n}: MVA kan bare brukes på inntekts- og kostnadskonti`);
    if (l.vatCategory && side && vatRegistered) {
      const { net, vat } = splitGross(amount, l.vatCategory);
      const code = side === "output" ? OUTPUT_VAT_CODE[l.vatCategory as VatCategory] : INPUT_VAT_CODE[l.vatCategory];
      lines.push({ account: l.account, amount: net, vatCode: code, description: l.description });
      if (vat !== 0) {
        lines.push({
          account: side === "output" ? OUTPUT_ACCOUNT[l.vatCategory] : ACCOUNTS.inputVat,
          amount: vat,
          vatCode: code,
          description: `MVA ${RATE[l.vatCategory]} %`,
        });
      }
    } else if (amount !== 0) {
      lines.push({ account: l.account, amount, description: l.description });
    }
  });
  if (errors.length) throw new Error(errors.join(". "));
  const debit = input.lines.reduce((s, l) => s + l.debitOre, 0);
  const credit = input.lines.reduce((s, l) => s + l.creditOre, 0);
  if (debit !== credit) throw new Error(`Bilaget balanserer ikke: debet og kredit avviker med ${Math.abs(debit - credit) / 100} kr`);
  const entry: JournalEntryDraft = {
    date: input.date,
    description: input.description.trim(),
    documentRef: input.documentRef?.trim() || `manuelt:${input.date}`,
    lines,
  };
  validateEntry(entry);
  return entry;
}
