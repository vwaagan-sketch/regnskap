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
