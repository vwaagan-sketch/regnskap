/**
 * Alle beløp lagres som heltall i øre for å unngå avrundingsfeil.
 * 1 kr = 100 øre.
 */
export type Ore = number;

export function kr(amount: number): Ore {
  return Math.round(amount * 100);
}

export function assertOre(value: Ore): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Beløp må være heltall i øre, fikk ${value}`);
  }
}

/** Formaterer øre som norsk kronebeløp, f.eks. 123456 -> "1 234,56" */
export function formatKr(ore: Ore): string {
  return new Intl.NumberFormat("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ore / 100);
}

/** Avrunder halvt opp bort fra null (kommersiell avrunding). */
export function roundHalfUp(value: number): Ore {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Leser et kronebeløp skrevet av en bruker ("1 234,50", "1234.5", "99") og gir øre.
 * Returnerer null hvis teksten ikke er et gyldig beløp.
 */
export function parseKr(input: string): Ore | null {
  const s = input.replace(/[\s ]/g, "").replace(/kr/i, "");
  if (!/^-?\d+([.,]\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.replace(",", ".").split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(frac.padEnd(2, "0")));
}

/** Øre til tekst for redigerbare felt, f.eks. 123450 -> "1234,50" */
export function oreToInput(ore: Ore): string {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(ore);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
