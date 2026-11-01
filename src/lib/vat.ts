/**
 * MVA-satser og Skatteetatens standard MVA-koder (SAF-T).
 * NB: Satser og koder må verifiseres mot Skatteetaten før produksjon.
 */
export type VatRate = 25 | 15 | 12 | 0;

export type VatCategory =
  | "high" // 25 %, alminnelig sats
  | "medium" // 15 %, næringsmidler
  | "low" // 12 %, persontransport, overnatting m.m.
  | "zero" // 0 %, fritatt (innenfor MVA-loven)
  | "exempt"; // unntatt / utenfor MVA-loven

export const VAT_RATES: Record<VatCategory, VatRate> = {
  high: 25,
  medium: 15,
  low: 12,
  zero: 0,
  exempt: 0,
};

/** Standard MVA-koder for utgående (salg) og inngående (kjøp) MVA. */
export const OUTPUT_VAT_CODE: Record<VatCategory, string> = {
  high: "3",
  medium: "31",
  low: "33",
  zero: "5",
  exempt: "6",
};

export const INPUT_VAT_CODE: Record<Exclude<VatCategory, "zero" | "exempt">, string> = {
  high: "1",
  medium: "11",
  low: "13",
};

/** Beregner MVA i øre av et nettobeløp i øre, avrundet til nærmeste øre. */
export function vatOf(netOre: number, category: VatCategory): number {
  const rate = VAT_RATES[category];
  return Math.sign(netOre) * Math.round((Math.abs(netOre) * rate) / 100);
}
