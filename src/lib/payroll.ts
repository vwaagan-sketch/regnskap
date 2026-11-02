import type { JournalEntryDraft, JournalLine } from "./ledger";
import { validateEntry } from "./ledger";
import { assertOre } from "./money";

/**
 * Lønnsberegning etter norske regler: forskuddstrekk, arbeidsgiveravgift (AGA) og feriepenger.
 * Alle beløp er heltall i øre. Satser er i basispunkter (1 % = 100 bp).
 *
 * Satsene må kontrolleres mot Skatteetaten hvert år før bruk.
 */

export const PAYROLL_ACCOUNTS = {
  bank: "1920",
  taxDeductionBank: "1950",
  withholdingTax: "2600",
  agaPayable: "2770",
  agaOnHolidayPayAccrued: "2785",
  salaryPayable: "2930",
  holidayPayPayable: "2940",
  salary: "5000",
  holidayPay: "5180",
  aga: "5400",
  agaOnHolidayPay: "5405",
} as const;

/** Arbeidsgiveravgift per sone (2026). Sone 1a og 4a (fribeløp) støttes ikke ennå. */
export type AgaZone = "1" | "2" | "3" | "4" | "5";
export const AGA_RATES_BP: Record<AgaZone, number> = { "1": 1410, "2": 1060, "3": 640, "4": 510, "5": 0 };
export const AGA_ZONE_LABEL: Record<AgaZone, string> = {
  "1": "Sone 1 (14,1 %)",
  "2": "Sone 2 (10,6 %)",
  "3": "Sone 3 (6,4 %)",
  "4": "Sone 4 (5,1 %)",
  "5": "Sone 5 (0 %)",
};
export const AGA_ZONES = Object.keys(AGA_RATES_BP) as AgaZone[];

/** Feriepenger: 10,2 % etter ferieloven (4 uker og 1 dag), 12 % ved avtalt femte ferieuke. */
export const HOLIDAY_RATES_BP = [1020, 1200] as const;
/** Tillegg for arbeidstakere over 60 år, beregnet av grunnlag opp til 6G. */
export const HOLIDAY_EXTRA_OVER_60_BP = 230;

/** Grunnbeløpet i folketrygden (G), gjelder fra 1. mai. Legg inn ny sats hvert år. */
export const GRUNNBELOEP: { from: string; ore: number }[] = [
  { from: "2024-05-01", ore: 12_402_800 },
  { from: "2025-05-01", ore: 13_016_000 },
];

export function grunnbeloep(date: string): number {
  let g = GRUNNBELOEP[0].ore;
  for (const row of GRUNNBELOEP) if (row.from <= date) g = row.ore;
  return g;
}

export type PayItemType = "fastloenn" | "timeloenn" | "overtid" | "bonus" | "feriepenger" | "trekkFerie";

export interface PayItemDef {
  label: string;
  /** Beskrivelse (kode) for lønnsinntekt i a-meldingen. */
  aMeldingCode: string;
  /** Konto som debiteres. Feriepenger belastes skyldig feriepenger, som ble avsatt da de ble opptjent. */
  account: string;
  /** -1 for trekk som reduserer bruttolønn. */
  sign: 1 | -1;
  /** Gir grunnlag for feriepenger (ferieloven § 10). */
  holidayBasis: boolean;
}

export const PAY_ITEMS: Record<PayItemType, PayItemDef> = {
  fastloenn: { label: "Fastlønn", aMeldingCode: "fastloenn", account: PAYROLL_ACCOUNTS.salary, sign: 1, holidayBasis: true },
  timeloenn: { label: "Timelønn", aMeldingCode: "timeloenn", account: PAYROLL_ACCOUNTS.salary, sign: 1, holidayBasis: true },
  overtid: { label: "Overtid", aMeldingCode: "overtidsgodtgjoerelse", account: PAYROLL_ACCOUNTS.salary, sign: 1, holidayBasis: true },
  bonus: { label: "Bonus", aMeldingCode: "bonus", account: PAYROLL_ACCOUNTS.salary, sign: 1, holidayBasis: true },
  feriepenger: { label: "Feriepenger", aMeldingCode: "feriepenger", account: PAYROLL_ACCOUNTS.holidayPayPayable, sign: 1, holidayBasis: false },
  trekkFerie: { label: "Trekk i lønn for ferie", aMeldingCode: "trekkILoennForFerie", account: PAYROLL_ACCOUNTS.salary, sign: -1, holidayBasis: false },
};
export const PAY_ITEM_TYPES = Object.keys(PAY_ITEMS) as PayItemType[];

export interface PayLineInput {
  type: PayItemType;
  description?: string;
  /** Antall (timer, måneder). Kan være negativ ved korrigering. */
  quantity: number;
  rateOre: number;
}

export interface CalculatedPayLine extends PayLineInput {
  amountOre: number;
}

export type TaxInput = { mode: "percent"; percent: number } | { mode: "manual"; amountOre: number };

export interface PayslipInput {
  lines: PayLineInput[];
  tax: TaxInput;
  agaRateBp: number;
  holidayRateBp: number;
  /** Tillegg for over 60 år: bare grunnlag opp til gjenstående 6G i året gir tillegg. */
  holidayExtra?: { eligible: boolean; capRemainingOre: number };
}

export interface CalculatedPayslip {
  lines: CalculatedPayLine[];
  grossOre: number;
  taxBasisOre: number;
  taxOre: number;
  netOre: number;
  /** AGA-grunnlag for lønn (kostnadsføres nå). */
  agaBasisSalaryOre: number;
  agaSalaryOre: number;
  /** AGA-grunnlag for utbetalte feriepenger (avgiften ble avsatt da feriepengene ble opptjent). */
  agaBasisHolidayOre: number;
  agaHolidayOre: number;
  holidayBasisOre: number;
  holidayPayOre: number;
  holidayAgaOre: number;
}

export class PayrollError extends Error {}

const pct = (amount: number, bp: number) => Math.round((amount * bp) / 10000);

/**
 * Prosenttrekk etter skattekortet. Trekket beregnes i hele kroner; øre ses bort fra.
 * Tabelltrekk må foreløpig legges inn manuelt (beløpet fra Skatteetatens trekktabell).
 */
export function percentTax(basisOre: number, percent: number): number {
  const sign = basisOre < 0 ? -1 : 1;
  const kroner = Math.floor((Math.abs(basisOre) * percent) / 10000);
  return sign * kroner * 100 || 0;
}

export function calculatePayslip(input: PayslipInput): CalculatedPayslip {
  if (input.lines.length === 0) throw new PayrollError("Lønnsslippen har ingen linjer");
  const lines: CalculatedPayLine[] = input.lines.map((l, i) => {
    const def = PAY_ITEMS[l.type];
    if (!def) throw new PayrollError(`Linje ${i + 1}: ukjent lønnsart`);
    if (!Number.isFinite(l.quantity) || l.quantity === 0) throw new PayrollError(`Linje ${i + 1}: antall mangler`);
    assertOre(l.rateOre);
    if (l.rateOre <= 0) throw new PayrollError(`Linje ${i + 1}: sats må være større enn 0`);
    const amountOre = def.sign * Math.round(l.quantity * l.rateOre);
    assertOre(amountOre);
    return { ...l, amountOre };
  });

  let grossOre = 0, agaBasisSalaryOre = 0, agaBasisHolidayOre = 0, holidayBasisOre = 0;
  for (const l of lines) {
    const def = PAY_ITEMS[l.type];
    grossOre += l.amountOre;
    if (l.type === "feriepenger") agaBasisHolidayOre += l.amountOre;
    else agaBasisSalaryOre += l.amountOre;
    if (def.holidayBasis) holidayBasisOre += l.amountOre;
  }
  // Alle lønnsartene her er kontantytelser som inngår i grunnlaget for forskuddstrekk.
  const taxBasisOre = grossOre;

  let taxOre: number;
  if (input.tax.mode === "percent") {
    if (!Number.isInteger(input.tax.percent) || input.tax.percent < 0 || input.tax.percent > 100) {
      throw new PayrollError("Trekkprosent må være et helt tall mellom 0 og 100");
    }
    taxOre = percentTax(taxBasisOre, input.tax.percent);
  } else {
    assertOre(input.tax.amountOre);
    taxOre = input.tax.amountOre;
    if (taxBasisOre >= 0 && (taxOre < 0 || taxOre > taxBasisOre)) {
      throw new PayrollError("Forskuddstrekket kan ikke være negativt eller større enn bruttolønnen");
    }
  }

  let holidayPayOre = pct(holidayBasisOre, input.holidayRateBp);
  if (input.holidayExtra?.eligible) {
    const extraBasis = holidayBasisOre > 0 ? Math.min(holidayBasisOre, Math.max(0, input.holidayExtra.capRemainingOre)) : holidayBasisOre;
    holidayPayOre += pct(extraBasis, HOLIDAY_EXTRA_OVER_60_BP);
  }

  return {
    lines,
    grossOre,
    taxBasisOre,
    taxOre,
    netOre: grossOre - taxOre,
    agaBasisSalaryOre,
    agaSalaryOre: pct(agaBasisSalaryOre, input.agaRateBp),
    agaBasisHolidayOre,
    agaHolidayOre: pct(agaBasisHolidayOre, input.agaRateBp),
    holidayBasisOre,
    holidayPayOre,
    holidayAgaOre: pct(holidayPayOre, input.agaRateBp),
  };
}

/** Summerer lønnsslipper til tall for lønnskjøringen. */
export function sumPayslips(slips: CalculatedPayslip[]) {
  const s = { grossOre: 0, taxOre: 0, netOre: 0, agaOre: 0, holidayPayOre: 0, holidayAgaOre: 0 };
  for (const p of slips) {
    s.grossOre += p.grossOre;
    s.taxOre += p.taxOre;
    s.netOre += p.netOre;
    s.agaOre += p.agaSalaryOre + p.agaHolidayOre;
    s.holidayPayOre += p.holidayPayOre;
    s.holidayAgaOre += p.holidayAgaOre;
  }
  return s;
}

/**
 * Postering for en lønnskjøring:
 * - lønn debet 5000 (utbetalte feriepenger debet 2940), forskuddstrekk kredit 2600, netto kredit 2930
 * - AGA av lønn debet 5400 / kredit 2770; AGA av utbetalte feriepenger debet 2785 / kredit 2770
 * - avsetning feriepenger debet 5180 / kredit 2940, med AGA debet 5405 / kredit 2785
 */
export function toPayrollEntry(run: { runNo: number; payDate: string; description: string }, slips: CalculatedPayslip[]): JournalEntryDraft {
  const A = PAYROLL_ACCOUNTS;
  const byAccount = new Map<string, number>();
  const add = (account: string, amount: number) => byAccount.set(account, (byAccount.get(account) ?? 0) + amount);
  for (const p of slips) {
    for (const l of p.lines) add(PAY_ITEMS[l.type].account, l.amountOre);
  }
  const t = slips.reduce(
    (s, p) => ({
      tax: s.tax + p.taxOre,
      net: s.net + p.netOre,
      agaSalary: s.agaSalary + p.agaSalaryOre,
      agaHoliday: s.agaHoliday + p.agaHolidayOre,
      holiday: s.holiday + p.holidayPayOre,
      holidayAga: s.holidayAga + p.holidayAgaOre,
    }),
    { tax: 0, net: 0, agaSalary: 0, agaHoliday: 0, holiday: 0, holidayAga: 0 },
  );
  const lines: JournalLine[] = [];
  const push = (account: string, amount: number, description: string) => {
    if (amount !== 0) lines.push({ account, amount, description });
  };
  for (const [account, amount] of byAccount) {
    push(account, amount, account === A.holidayPayPayable ? "Utbetalte feriepenger" : "Bruttolønn");
  }
  push(A.withholdingTax, -t.tax, "Forskuddstrekk");
  push(A.salaryPayable, -t.net, "Netto lønn til utbetaling");
  push(A.aga, t.agaSalary, "Arbeidsgiveravgift");
  push(A.agaOnHolidayPayAccrued, t.agaHoliday, "AGA av utbetalte feriepenger");
  push(A.agaPayable, -(t.agaSalary + t.agaHoliday), "Skyldig arbeidsgiveravgift");
  push(A.holidayPay, t.holiday, "Avsatte feriepenger");
  push(A.holidayPayPayable, -t.holiday, "Avsatte feriepenger");
  push(A.agaOnHolidayPay, t.holidayAga, "AGA av avsatte feriepenger");
  push(A.agaOnHolidayPayAccrued, -t.holidayAga, "AGA av avsatte feriepenger");

  const entry: JournalEntryDraft = {
    date: run.payDate,
    description: `Lønnskjøring ${run.runNo}: ${run.description}`,
    documentRef: `lonn:${run.runNo}`,
    lines,
  };
  validateEntry(entry);
  return entry;
}

/** Utbetaling av nettolønn, og eventuelt overføring av forskuddstrekket til skattetrekkskontoen. */
export function toPayoutEntry(
  run: { runNo: number; netOre: number; taxOre: number },
  date: string,
  transferTax: boolean,
): JournalEntryDraft {
  const A = PAYROLL_ACCOUNTS;
  if (run.netOre <= 0) throw new PayrollError("Netto lønn er ikke positiv; ingenting å utbetale");
  const lines: JournalLine[] = [
    { account: A.salaryPayable, amount: run.netOre, description: "Utbetalt nettolønn" },
    { account: A.bank, amount: -run.netOre, description: "Utbetalt nettolønn" },
  ];
  if (transferTax && run.taxOre > 0) {
    lines.push(
      { account: A.taxDeductionBank, amount: run.taxOre, description: "Forskuddstrekk til skattetrekkskonto" },
      { account: A.bank, amount: -run.taxOre, description: "Forskuddstrekk til skattetrekkskonto" },
    );
  }
  const entry: JournalEntryDraft = {
    date,
    description: `Utbetaling lønnskjøring ${run.runNo}`,
    documentRef: `lonn-utbetaling:${run.runNo}`,
    lines,
  };
  validateEntry(entry);
  return entry;
}

/** Kalendermåned (yyyy-mm) for a-meldingen er måneden lønnen utbetales. */
export function periodOf(payDate: string): string {
  return payDate.slice(0, 7);
}

/** A-meldingen skal leveres innen den 5. i måneden etter utbetalingen. */
export function aMeldingDeadline(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-05`;
}

/** Forskuddstrekk og AGA betales per termin (to måneder) innen den 15. i måneden etter terminen. */
export function paymentTerm(period: string): { term: number; label: string; deadline: string } {
  const [y, m] = period.split("-").map(Number);
  const term = Math.ceil(m / 2);
  const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  const endMonth = term * 2;
  const dy = endMonth === 12 ? y + 1 : y;
  const dm = endMonth === 12 ? 1 : endMonth + 1;
  return {
    term,
    label: `${term}. termin ${y} (${months[endMonth - 2]}–${months[endMonth - 1]})`,
    deadline: `${dy}-${String(dm).padStart(2, "0")}-15`,
  };
}

/** Kontrollerer fødselsnummer eller D-nummer (11 siffer, to kontrollsiffer etter modulus 11). */
export function isValidNationalId(id: string): boolean {
  if (!/^\d{11}$/.test(id)) return false;
  const d = id.split("").map(Number);
  const k = (weights: number[]) => {
    const r = 11 - (weights.reduce((s, w, i) => s + w * d[i], 0) % 11);
    return r === 11 ? 0 : r;
  };
  const k1 = k([3, 7, 6, 1, 8, 9, 4, 5, 2]);
  const k2 = k([5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
  return k1 !== 10 && k2 !== 10 && k1 === d[9] && k2 === d[10] && birthDateFromNationalId(id) !== null;
}

/** Fødselsdato fra fødselsnummer/D-nummer (også syntetiske testnummer fra Tenor, måned + 80). */
export function birthDateFromNationalId(id: string): string | null {
  if (!/^\d{11}$/.test(id)) return null;
  let day = Number(id.slice(0, 2));
  let month = Number(id.slice(2, 4));
  const yy = Number(id.slice(4, 6));
  const ind = Number(id.slice(6, 9));
  if (day > 40) day -= 40; // D-nummer
  if (month > 80) month -= 80; // syntetisk (Tenor)
  else if (month > 40) month -= 40; // H-nummer
  let century: number;
  if (ind <= 499) century = 1900;
  else if (ind <= 749 && yy >= 54) century = 1800;
  else if (yy <= 39) century = 2000;
  else if (ind >= 900) century = 1900;
  else return null;
  const year = century + yy;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Tillegg for over 60: arbeidstakeren fyller 60 år innen 1. september i ferieåret (året etter opptjeningsåret). */
export function holidayExtraEligible(birthDate: string, earnYear: number): boolean {
  return birthDate <= `${earnYear + 1 - 60}-09-01`;
}

export interface EmployeeInput {
  name: string;
  national_id: string;
  email: string | null;
  address: string;
  postal_code: string;
  city: string;
  bank_account: string | null;
  employment_id: string;
  start_date: string;
  end_date: string | null;
  occupation_code: string;
  position_pct: number;
  hours_per_week: number;
  pay_type: "fast" | "time";
  monthly_salary_ore: number | null;
  hourly_rate_ore: number | null;
  tax_percent: number;
}

export function validateEmployee(e: EmployeeInput): string[] {
  const errors: string[] = [];
  if (!e.name.trim()) errors.push("Navn mangler");
  if (!isValidNationalId(e.national_id)) errors.push("Ugyldig fødselsnummer eller D-nummer");
  if (!e.address.trim() || !e.postal_code.trim() || !e.city.trim()) errors.push("Adresse, postnummer og sted må fylles ut");
  if (e.email && !/^\S+@\S+\.\S+$/.test(e.email)) errors.push("Ugyldig e-postadresse");
  if (e.bank_account && !/^\d{11}$/.test(e.bank_account)) errors.push("Kontonummeret må ha 11 siffer");
  if (!e.employment_id.trim()) errors.push("Arbeidsforhold-ID mangler");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start_date)) errors.push("Startdato mangler");
  if (e.end_date && e.end_date < e.start_date) errors.push("Sluttdato er før startdato");
  if (!/^\d{7}$/.test(e.occupation_code)) errors.push("Yrkeskode (STYRK-08) må ha 7 siffer");
  if (!(e.position_pct > 0 && e.position_pct <= 100)) errors.push("Stillingsprosent må være mellom 0 og 100");
  if (!(e.hours_per_week > 0 && e.hours_per_week <= 60)) errors.push("Timer per uke for full stilling må være mellom 0 og 60");
  if (e.pay_type === "fast" && !(e.monthly_salary_ore && e.monthly_salary_ore > 0)) errors.push("Månedslønn mangler");
  if (e.pay_type === "time" && !(e.hourly_rate_ore && e.hourly_rate_ore > 0)) errors.push("Timesats mangler");
  if (!Number.isInteger(e.tax_percent) || e.tax_percent < 0 || e.tax_percent > 100) errors.push("Trekkprosent må være et helt tall mellom 0 og 100");
  return errors;
}
