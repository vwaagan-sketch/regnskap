import { AGA_RATES_BP, PAY_ITEMS, birthDateFromNationalId, isValidNationalId, type AgaZone, type PayItemType } from "./payroll";

/**
 * A-meldingen (a-ordningen) for én kalendermåned, etter Skatteetatens meldingsformat v2.
 * Filen må valideres mot gjeldende XSD (og helst testes i Skatteetatens testmiljø) før den sendes inn.
 */
export const A_MELDING_NAMESPACE = "urn:ske:fastsetting:innsamling:a-meldingen:v2_0";

export interface AMeldingEmployee {
  nationalId: string;
  name: string;
  employmentId: string;
  startDate: string;
  endDate: string | null;
  occupationCode: string;
  positionPct: number;
  hoursPerWeek: number;
  payType: "fast" | "time";
  /** Sum per lønnsart i måneden. Ansatte uten utbetaling rapporteres likevel med arbeidsforholdet. */
  income: Partial<Record<PayItemType, number>>;
  taxOre: number;
}

export interface AMeldingInput {
  period: string; // yyyy-mm
  meldingsId: string;
  replacesMeldingsId?: string | null;
  createdAt: string; // ISO-tidspunkt
  orgNo: string; // opplysningspliktig (juridisk enhet)
  businessUnitOrgNo: string; // virksomhet (underenhet)
  agaZone: AgaZone;
  /** Grunnlag for arbeidsgiveravgift i måneden (lønn og utbetalte feriepenger). */
  agaBasisOre: number;
  employees: AMeldingEmployee[];
}

export interface AMeldingSummary {
  sumTaxOre: number;
  sumAgaOre: number;
  agaBasisOre: number;
  agaRateBp: number;
}

export function aMeldingSummary(input: AMeldingInput): AMeldingSummary {
  const agaRateBp = AGA_RATES_BP[input.agaZone];
  return {
    sumTaxOre: input.employees.reduce((s, e) => s + e.taxOre, 0),
    sumAgaOre: Math.round((input.agaBasisOre * agaRateBp) / 10000),
    agaBasisOre: input.agaBasisOre,
    agaRateBp,
  };
}

export function validateAMelding(input: AMeldingInput): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) errors.push("Ugyldig kalendermåned");
  if (!/^\d{9}$/.test(input.orgNo)) errors.push("Organisasjonsnummeret må ha 9 siffer");
  if (!/^\d{9}$/.test(input.businessUnitOrgNo)) errors.push("Mangler organisasjonsnummer for virksomheten (underenheten) under Lønn → Innstillinger");
  if (input.employees.length === 0) errors.push("Ingen arbeidsforhold å rapportere for måneden");
  for (const e of input.employees) {
    if (!isValidNationalId(e.nationalId)) errors.push(`${e.name}: ugyldig fødselsnummer`);
    if (!/^\d{7}$/.test(e.occupationCode)) errors.push(`${e.name}: yrkeskode mangler`);
  }
  return errors;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Øre til desimalbeløp med punktum, f.eks. -123456 -> "-1234.56". */
export function xmlAmount(ore: number): string {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(ore);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const pctText = (bp: number) => (bp / 100).toFixed(1);

export function buildAMeldingXml(input: AMeldingInput): string {
  const errors = validateAMelding(input);
  if (errors.length) throw new Error(errors.join(". "));
  const sum = aMeldingSummary(input);
  const out: string[] = [];
  const el = (indent: number, name: string, value: string | number) =>
    out.push(`${"  ".repeat(indent)}<${name}>${esc(String(value))}</${name}>`);
  const open = (indent: number, name: string) => out.push(`${"  ".repeat(indent)}<${name}>`);
  const close = (indent: number, name: string) => out.push(`${"  ".repeat(indent)}</${name}>`);

  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<melding xmlns="${A_MELDING_NAMESPACE}">`);
  open(1, "Leveranse");
  el(2, "leveringstidspunkt", input.createdAt);
  el(2, "kalendermaaned", input.period);
  el(2, "kildesystem", "Regnskap");
  if (input.replacesMeldingsId) el(2, "erstatterMeldingsId", input.replacesMeldingsId);
  el(2, "meldingsId", input.meldingsId);
  open(2, "opplysningspliktig");
  el(3, "norskIdentifikator", input.orgNo);
  close(2, "opplysningspliktig");
  open(2, "oppgave");
  open(3, "betalingsinformasjon");
  el(4, "sumForskuddstrekk", xmlAmount(-sum.sumTaxOre));
  el(4, "sumArbeidsgiveravgift", xmlAmount(sum.sumAgaOre));
  close(3, "betalingsinformasjon");
  open(3, "virksomhet");
  el(4, "norskIdentifikator", input.businessUnitOrgNo);

  for (const e of input.employees) {
    open(4, "inntektsmottaker");
    el(5, "norskIdentifikator", e.nationalId);
    open(5, "identifiserendeInformasjon");
    el(6, "navn", e.name);
    el(6, "foedselsdato", birthDateFromNationalId(e.nationalId) ?? "");
    close(5, "identifiserendeInformasjon");
    open(5, "arbeidsforhold");
    el(6, "arbeidsforholdId", e.employmentId);
    el(6, "typeArbeidsforhold", "ordinaertArbeidsforhold");
    el(6, "startdato", e.startDate);
    if (e.endDate) el(6, "sluttdato", e.endDate);
    el(6, "antallTimerPerUkeSomEnFullStillingTilsvarer", e.hoursPerWeek.toFixed(2));
    el(6, "avloenningstype", e.payType === "fast" ? "fast" : "time");
    el(6, "yrke", e.occupationCode);
    el(6, "arbeidstidsordning", "ikkeSkift");
    el(6, "stillingsprosent", e.positionPct.toFixed(2));
    close(5, "arbeidsforhold");
    if (e.taxOre !== 0) {
      open(5, "forskuddstrekk");
      el(6, "beloep", xmlAmount(-e.taxOre));
      close(5, "forskuddstrekk");
    }
    for (const [type, amount] of Object.entries(e.income) as [PayItemType, number][]) {
      if (!amount) continue;
      open(5, "inntekt");
      el(6, "fordel", "kontantytelse");
      el(6, "utloeserArbeidsgiveravgift", "true");
      el(6, "inngaarIGrunnlagForTrekk", "true");
      el(6, "beloep", xmlAmount(amount));
      open(6, "loennsinntekt");
      el(7, "beskrivelse", PAY_ITEMS[type].aMeldingCode);
      close(6, "loennsinntekt");
      close(5, "inntekt");
    }
    close(4, "inntektsmottaker");
  }

  open(4, "arbeidsgiveravgift");
  open(5, "loennOgGodtgjoerelse");
  el(6, "sone", input.agaZone);
  el(6, "beregningskodeForArbeidsgiveravgift", "generelleNaeringer");
  el(6, "avgiftsgrunnlagBeloep", xmlAmount(sum.agaBasisOre));
  el(6, "prosentsatsForAvgiftsberegning", pctText(sum.agaRateBp));
  close(5, "loennOgGodtgjoerelse");
  close(4, "arbeidsgiveravgift");

  close(3, "virksomhet");
  close(2, "oppgave");
  close(1, "Leveranse");
  out.push(`</melding>`);
  return out.join("\n") + "\n";
}
