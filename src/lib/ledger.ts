import { assertOre } from "./money";

/**
 * Dobbel bokføring. En postering (bilag) består av linjer der sum debet = sum kredit.
 * Bokførte posteringer er uforanderlige; rettelser gjøres med en ny, reverserende postering.
 */
export interface JournalLine {
  account: string;
  /** Positivt = debet, negativt = kredit, i øre. */
  amount: number;
  vatCode?: string;
  description?: string;
}

export interface JournalEntryDraft {
  date: string; // ISO yyyy-mm-dd
  description: string;
  /** Referanse til dokumentasjon (faktura, kvittering) - kontrollspor. */
  documentRef: string;
  lines: JournalLine[];
}

export class LedgerError extends Error {}

export function validateEntry(entry: JournalEntryDraft): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    throw new LedgerError("Ugyldig dato på postering");
  }
  if (!entry.documentRef) {
    throw new LedgerError("Postering mangler referanse til dokumentasjon");
  }
  if (entry.lines.length < 2) {
    throw new LedgerError("En postering må ha minst to linjer");
  }
  let sum = 0;
  for (const line of entry.lines) {
    assertOre(line.amount);
    if (line.amount === 0) throw new LedgerError("Posteringslinje med beløp 0");
    if (!/^\d{4}$/.test(line.account)) {
      throw new LedgerError(`Ugyldig kontonummer ${line.account}`);
    }
    sum += line.amount;
  }
  if (sum !== 0) {
    throw new LedgerError(`Posteringen balanserer ikke (differanse ${sum} øre)`);
  }
}

/** Lager en reverserende postering som nuller ut en tidligere postering. */
export function reverseEntry(
  original: JournalEntryDraft,
  date: string,
  documentRef: string,
): JournalEntryDraft {
  return {
    date,
    documentRef,
    description: `Reversering: ${original.description}`,
    lines: original.lines.map((l) => ({ ...l, amount: -l.amount })),
  };
}

export function trialBalance(entries: JournalEntryDraft[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const e of entries) {
    for (const l of e.lines) {
      balances.set(l.account, (balances.get(l.account) ?? 0) + l.amount);
    }
  }
  return balances;
}
