/**
 * MVA-melding: oppstilling per MVA-kode for en termin, beregnet fra posteringene.
 * Linjer på MVA-kontoene (27xx) er avgift, øvrige linjer med MVA-kode er grunnlag.
 */

export interface VatLineInput {
  account: string;
  amountOre: number;
  vatCode: string;
}

export interface VatReportLine {
  code: string;
  label: string;
  rate: number;
  baseOre: number;
  /** Utgående MVA er positiv, fradrag for inngående MVA er negativ (som i MVA-meldingen). */
  vatOre: number;
}

export interface VatReport {
  lines: VatReportLine[];
  outputOre: number;
  inputOre: number;
  /** Positiv: å betale. Negativ: til gode. */
  payableOre: number;
}

export const VAT_CODES: Record<string, { label: string; rate: number; side: "output" | "input" }> = {
  "3": { label: "Innenlands omsetning, alminnelig sats", rate: 25, side: "output" },
  "31": { label: "Innenlands omsetning, middels sats", rate: 15, side: "output" },
  "33": { label: "Innenlands omsetning, lav sats", rate: 12, side: "output" },
  "5": { label: "Innenlands omsetning fritatt for MVA (nullsats)", rate: 0, side: "output" },
  "6": { label: "Omsetning unntatt MVA-loven", rate: 0, side: "output" },
  "1": { label: "Fradrag for inngående MVA, alminnelig sats", rate: 25, side: "input" },
  "11": { label: "Fradrag for inngående MVA, middels sats", rate: 15, side: "input" },
  "13": { label: "Fradrag for inngående MVA, lav sats", rate: 12, side: "input" },
};

const ORDER = ["3", "31", "33", "5", "6", "1", "11", "13"];

export const isVatAccount = (a: string) => a >= "2700" && a <= "2739";

export function buildVatReport(lines: VatLineInput[]): VatReport {
  const acc = new Map<string, { base: number; vat: number }>();
  for (const l of lines) {
    const def = VAT_CODES[l.vatCode];
    if (!def) continue;
    const b = acc.get(l.vatCode) ?? { base: 0, vat: 0 };
    // Utgående: kreditbeløp (negative) gir positivt grunnlag. Inngående: debet gir grunnlag, avgiften blir fradrag (negativ).
    const sign = def.side === "output" ? -1 : 1;
    if (isVatAccount(l.account)) b.vat += sign * l.amountOre;
    else b.base += sign * l.amountOre;
    acc.set(l.vatCode, b);
  }
  const out: VatReportLine[] = [];
  for (const code of ORDER) {
    const b = acc.get(code);
    if (!b || (b.base === 0 && b.vat === 0)) continue;
    const def = VAT_CODES[code];
    out.push({ code, label: def.label, rate: def.rate, baseOre: b.base, vatOre: def.side === "output" ? b.vat : -b.vat });
  }
  const outputOre = out.filter((l) => VAT_CODES[l.code].side === "output").reduce((s, l) => s + l.vatOre, 0);
  const inputOre = -out.filter((l) => VAT_CODES[l.code].side === "input").reduce((s, l) => s + l.vatOre, 0);
  return { lines: out, outputOre, inputOre, payableOre: outputOre - inputOre };
}

/** MVA-terminer. Alminnelig termin er to måneder; årstermin for små virksomheter. */
export const TERMS = [
  { id: "1", label: "1. termin (jan–feb)", from: "01-01", to: "02-28", name: "januar-februar" },
  { id: "2", label: "2. termin (mar–apr)", from: "03-01", to: "04-30", name: "mars-april" },
  { id: "3", label: "3. termin (mai–jun)", from: "05-01", to: "06-30", name: "mai-juni" },
  { id: "4", label: "4. termin (jul–aug)", from: "07-01", to: "08-31", name: "juli-august" },
  { id: "5", label: "5. termin (sep–okt)", from: "09-01", to: "10-31", name: "september-oktober" },
  { id: "6", label: "6. termin (nov–des)", from: "11-01", to: "12-31", name: "november-desember" },
  { id: "aar", label: "Årstermin", from: "01-01", to: "12-31", name: "januar-desember" },
] as const;

export function termPeriod(year: number, termId: string): { from: string; to: string; label: string } | null {
  const t = TERMS.find((x) => x.id === termId);
  if (!t) return null;
  let to = `${year}-${t.to}`;
  if (t.to === "02-28") {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    to = `${year}-02-${leap ? "29" : "28"}`;
  }
  return { from: `${year}-${t.from}`, to, label: `${t.label} ${year}` };
}

/** Terminen en dato hører til (alminnelig to-månederstermin). */
export function termOf(date: string): string {
  return String(Math.ceil(Number(date.slice(5, 7)) / 2));
}
