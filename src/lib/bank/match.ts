import { ACCOUNTS } from "../accounts";
import type { JournalEntryDraft } from "../ledger";
import { buildManualEntry } from "../manual-entry";
import { kidFromText } from "./statement";

/**
 * Forslag til avstemming. Hver banktransaksjon får høyst ett forslag, og hver faktura eller
 * postering brukes høyst én gang. Forslag med «sikker» treff kan godkjennes samlet.
 */
export interface BankTx {
  id: string;
  date: string;
  amountOre: number;
  description: string;
  counterparty?: string | null;
  reference?: string | null;
}

export interface OpenInvoice {
  id: number;
  number: number;
  kid: string | null;
  openOre: number;
  customerName: string;
}

/** Postering på bankkontoen som ikke er avstemt mot banken ennå. */
export interface LedgerCandidate {
  entryId: string;
  voucherNo: number;
  date: string;
  amountOre: number;
  description: string;
}

export type Confidence = "sikker" | "sannsynlig" | "mulig";

export type Suggestion =
  | { kind: "invoice"; invoiceId: number; invoiceNumber: number; amountOre: number; score: number; confidence: Confidence; reason: string }
  | { kind: "entry"; entryId: string; voucherNo: number; score: number; confidence: Confidence; reason: string };

export function confidenceOf(score: number): Confidence {
  return score >= 90 ? "sikker" : score >= 70 ? "sannsynlig" : "mulig";
}

const DAY = 86_400_000;
export function daysBetween(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function mentionsInvoice(text: string, n: number): "explicit" | "number" | null {
  const re = new RegExp(`(faktura|fakt|fnr|f\\.nr|invoice|inv)\\.?\\s*(nr\\.?|nummer)?\\s*[:#]?\\s*0*${n}\\b`, "i");
  if (re.test(text)) return "explicit";
  if (new RegExp(`(^|[^\\d])0*${n}([^\\d]|$)`).test(text)) return "number";
  return null;
}

function nameHit(text: string, name: string): boolean {
  const words = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !["as", "asa", "ans", "da", "enk"].includes(w));
  const t = text.toLowerCase();
  return words.length > 0 && words.every((w) => t.includes(w));
}

interface Pair { txId: string; key: string; s: Suggestion; tie: number }

function invoicePairs(tx: BankTx, invoices: OpenInvoice[]): Pair[] {
  if (tx.amountOre <= 0) return [];
  const text = `${tx.description} ${tx.counterparty ?? ""}`;
  const kid = digits(tx.reference) || digits(kidFromText(text));
  const out: Pair[] = [];
  for (const inv of invoices) {
    if (inv.openOre <= 0) continue;
    let score = 0;
    let reason = "";
    const kidHit = kid !== "" && inv.kid !== null && kid === digits(inv.kid);
    const exact = tx.amountOre === inv.openOre;
    if (kidHit && exact) { score = 100; reason = "KID og beløp stemmer"; }
    else if (kidHit && tx.amountOre < inv.openOre) { score = 85; reason = "KID stemmer, delbetaling"; }
    else if (exact) {
      const mention = mentionsInvoice(text, inv.number);
      if (mention === "explicit") { score = 92; reason = `Beløp stemmer og teksten nevner faktura ${inv.number}`; }
      else if (nameHit(text, inv.customerName)) { score = 80; reason = `Beløp og kundenavn stemmer`; }
      else if (mention === "number") { score = 75; reason = `Beløp stemmer og teksten inneholder ${inv.number}`; }
      else { score = 55; reason = "Bare beløpet stemmer"; }
    } else continue;
    out.push({
      txId: tx.id, key: `inv:${inv.id}`, tie: 0,
      s: { kind: "invoice", invoiceId: inv.id, invoiceNumber: inv.number, amountOre: tx.amountOre, score, confidence: confidenceOf(score), reason },
    });
  }
  return out;
}

function entryPairs(tx: BankTx, entries: LedgerCandidate[]): Pair[] {
  const out: Pair[] = [];
  for (const e of entries) {
    if (e.amountOre !== tx.amountOre) continue;
    const days = daysBetween(e.date, tx.date);
    if (days > 10) continue;
    const score = 95 - days * 5;
    out.push({
      txId: tx.id, key: `entry:${e.entryId}`, tie: days,
      s: {
        kind: "entry", entryId: e.entryId, voucherNo: e.voucherNo, score, confidence: confidenceOf(score),
        reason: days === 0 ? `Bilag ${e.voucherNo} har samme beløp og dato` : `Bilag ${e.voucherNo} har samme beløp, ${days} ${days === 1 ? "dag" : "dager"} fra bankdato`,
      },
    });
  }
  return out;
}

export function suggestMatches(txs: BankTx[], invoices: OpenInvoice[], entries: LedgerCandidate[]): Map<string, Suggestion> {
  const pairs: Pair[] = [];
  for (const tx of txs) {
    const mine = [...invoicePairs(tx, invoices), ...entryPairs(tx, entries)];
    // Flere like gode treff for samme banklinje: ikke sikkert hvilket som er riktig.
    const top = Math.max(...mine.map((p) => p.s.score), 0);
    const ties = mine.filter((p) => p.s.score === top);
    for (const p of mine) {
      if (ties.length > 1 && p.s.score === top && top >= 70) {
        p.s = { ...p.s, score: 69, confidence: "mulig", reason: `${p.s.reason} (flere mulige treff)` };
      }
      pairs.push(p);
    }
  }
  // Samme faktura eller bilag passer flere banklinjer like godt: heller ikke sikkert.
  const byKey = new Map<string, Pair[]>();
  for (const p of pairs) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  for (const list of byKey.values()) {
    const top = Math.max(...list.map((p) => p.s.score));
    const best = list.filter((p) => p.s.score === top && p.tie === Math.min(...list.filter((q) => q.s.score === top).map((q) => q.tie)));
    if (best.length > 1 && top >= 70) {
      for (const p of best) p.s = { ...p.s, score: 69, confidence: "mulig", reason: `${p.s.reason} (flere banklinjer passer)` };
    }
  }
  pairs.sort((a, b) => b.s.score - a.s.score || a.tie - b.tie || a.txId.localeCompare(b.txId));
  const result = new Map<string, Suggestion>();
  const used = new Set<string>();
  for (const p of pairs) {
    if (result.has(p.txId) || used.has(p.key)) continue;
    result.set(p.txId, p.s);
    used.add(p.key);
  }
  return result;
}

export interface NewBankEntryInput {
  date: string;
  amountOre: number;
  /** Motkonto, f.eks. 7770 bankgebyr eller 2400 leverandørgjeld. */
  account: string;
  vatCategory?: "high" | "medium" | "low" | null;
  description: string;
  documentRef: string;
}

/** Lager postering for en banklinje: bankkontoen mot valgt konto, eventuelt med MVA. */
export function buildBankEntry(input: NewBankEntryInput, vatRegistered: boolean): JournalEntryDraft {
  if (input.account === ACCOUNTS.bank) throw new Error("Velg en annen konto enn bankkontoen");
  const abs = Math.abs(input.amountOre);
  const incoming = input.amountOre > 0;
  return buildManualEntry(
    {
      date: input.date,
      description: input.description,
      documentRef: input.documentRef,
      lines: [
        { account: ACCOUNTS.bank, debitOre: incoming ? abs : 0, creditOre: incoming ? 0 : abs },
        { account: input.account, debitOre: incoming ? 0 : abs, creditOre: incoming ? abs : 0, vatCategory: input.vatCategory ?? null },
      ],
    },
    vatRegistered,
  );
}
