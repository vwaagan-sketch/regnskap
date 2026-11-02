import { createHash } from "node:crypto";

/** En transaksjon slik den står på kontoutskriften. Beløp i øre, positivt = inn på konto. */
export interface BankTransactionInput {
  bookingDate: string;
  valueDate?: string;
  amountOre: number;
  description: string;
  counterparty?: string;
  /** KID eller annen strukturert betalingsreferanse. */
  reference?: string;
  /** Bankens unike arkivreferanse for transaksjonen. */
  bankRef?: string;
}

export interface ParsedStatement {
  format: "camt053" | "csv";
  accountNo?: string;
  statementRef?: string;
  fromDate?: string;
  toDate?: string;
  openingOre?: number;
  closingOre?: number;
  transactions: BankTransactionInput[];
}

export class StatementError extends Error {}

/**
 * Leser et beløp fra banken uten flyttall: "1234.50", "-1 234,50", "1.234,50", "+12,5".
 * Returnerer null hvis teksten ikke er et beløp med høyst to desimaler.
 */
export function parseAmountOre(input: string): number | null {
  let s = input.replace(/[\s  ']/g, "").replace(/^kr/i, "").replace(/(kr|nok)$/i, "");
  let sign = 1;
  if (/^[-−]/.test(s)) { sign = -1; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (/-$/.test(s)) { sign = -sign; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let whole: string;
  let frac = "";
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    const thousands = dec === lastDot ? "," : ".";
    whole = s.slice(0, dec).split(thousands).join("");
    frac = s.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    // Komma er alltid desimaltegn; punktum kan også skille tusener (1.234.567).
    if (parts.length === 2 && parts[1].length <= 2) {
      [whole, frac] = parts;
    } else if (sep === "." && parts.slice(1).every((p) => p.length === 3) && parts[0].length >= 1 && parts[0].length <= 3) {
      whole = parts.join("");
    } else {
      return null;
    }
  } else {
    whole = s;
  }
  if (!/^\d+$/.test(whole || "0") || !/^\d{0,2}$/.test(frac)) return null;
  const ore = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(ore)) return null;
  return sign * ore || 0;
}

/** Desimaltall fra XML (punktum som desimaltegn), f.eks. "1234.5" eller "100.000". */
export function parseDecimalOre(input: string): number | null {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!m) return null;
  const frac = m[3] ?? "";
  if (/[1-9]/.test(frac.slice(2))) return null;
  const ore = Number(m[2]) * 100 + Number(frac.slice(0, 2).padEnd(2, "0"));
  if (!Number.isSafeInteger(ore)) return null;
  return (m[1] === "-" ? -1 : 1) * ore || 0;
}

function validIso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Leser dato som dd.mm.åååå, dd.mm.åå, dd/mm/åååå, åååå-mm-dd eller ISO med klokkeslett. */
export function parseBankDate(input: string): string | null {
  const s = input.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validIso(y, +m[2], +m[1]);
  }
  return null;
}

/** Normaliserer kontonummer: IBAN NOkk + 11 siffer gir de 11 sifrene. */
export function normalizeAccountNo(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const c = s.replace(/[\s.]/g, "").toUpperCase();
  if (/^NO\d{13}$/.test(c)) return c.slice(4);
  return c;
}

/** Finner KID i fritekst, f.eks. "Giro KID: 000123456789". */
export function kidFromText(text: string | undefined): string | undefined {
  const m = /\bKID\b[\s.:#-]*(\d{2,25})\b/i.exec(text ?? "");
  return m?.[1];
}

/**
 * Nøkkel som hindrer dobbel import. Bankens arkivreferanse brukes når den finnes.
 * Ellers brukes dato, beløp og tekst, pluss løpenummer for like transaksjoner i samme fil.
 */
export function dedupeKeys(accountNo: string | undefined, txs: BankTransactionInput[]): string[] {
  const seen = new Map<string, number>();
  return txs.map((t) => {
    const acct = accountNo ?? "";
    if (t.bankRef) return `ref:${acct}:${t.bankRef}`;
    const base = createHash("sha256")
      .update([acct, t.bookingDate, t.amountOre, t.description.trim().toLowerCase(), t.reference ?? ""].join("|"))
      .digest("hex")
      .slice(0, 32);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `h:${base}:${n}`;
  });
}
