import {
  StatementError, kidFromText, parseAmountOre, parseBankDate,
  type BankTransactionInput, type ParsedStatement,
} from "./statement";

/**
 * Leser CSV-eksport fra nettbanken. Kolonnene finnes ut fra overskriftene, så formatene fra
 * de vanlige norske bankene virker (DNB, Nordea, SpareBank 1, Sbanken, Handelsbanken m.fl.):
 * enten én beløpskolonne med fortegn, eller egne kolonner for inn og ut.
 */

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && cur.trim() === "") { quoted = true; cur = ""; }
    else if (c === delim) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Deler i linjer, men ikke inne i felt med anførselstegn. */
function splitRecords(text: string): string[] {
  const lines: string[] = [];
  let cur = "";
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if ((c === "\n" || c === "\r") && !quoted) {
      if (cur.trim()) lines.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) lines.push(cur);
  return lines;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-zæøå0-9]/g, "");

type Role = "date" | "valueDate" | "amount" | "in" | "out" | "text" | "counterparty" | "kid" | "bankRef";

const PATTERNS: [Role, RegExp][] = [
  ["valueDate", /^(rentedato|valuteringsdato|valutadato|valuedate)$/],
  ["date", /^(dato|bokført|bokførtdato|bokføringsdato|bokfdato|transaksjonsdato|utførtdato|betalingsdato|date|bookingdate)$/],
  ["in", /^(inn|innpåkonto|innkr|innbeløp|innskudd|kredit|innnok|credit)$/],
  ["out", /^(ut|utfrakonto|utkr|utbeløp|uttak|debet|utnok|debit)$/],
  ["amount", /^(beløp|belop|beløpnok|beløpikr|amount|sum)$/],
  ["kid", /^(kid|kidnummer|kidnr)$/],
  ["bankRef", /^(arkivreferanse|arkivref|referanse|ref|bankreferanse|numref)$/],
  ["counterparty", /^(navn|motpart|betaler|mottakernavn|avsendernavn)$/],
  ["text", /^(forklaring|tekst|beskrivelse|tittel|melding|transaksjonstekst|description|text|type)$/],
];

function mapHeader(cells: string[]): Partial<Record<Role, number>> & { text?: number; extraText: number[] } {
  const map: Partial<Record<Role, number>> & { extraText: number[] } = { extraText: [] };
  cells.forEach((cell, i) => {
    const h = norm(cell);
    for (const [role, re] of PATTERNS) {
      if (re.test(h)) {
        if (map[role] === undefined) map[role] = i;
        else if (role === "text") map.extraText.push(i);
        break;
      }
    }
  });
  return map;
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10).join("\n");
  const counts = [";", "\t", ","].map((d) => [d, sample.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

export function parseBankCsv(input: string): ParsedStatement {
  const text = input.replace(/^﻿/, "");
  const lines = splitRecords(text);
  if (lines.length === 0) throw new StatementError("Filen er tom");
  const delim = detectDelimiter(lines);
  let headerIdx = -1;
  let map: ReturnType<typeof mapHeader> | null = null;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const m = mapHeader(splitLine(lines[i], delim));
    if (m.date !== undefined && (m.amount !== undefined || m.in !== undefined || m.out !== undefined)) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (!map) {
    throw new StatementError(
      "Fant ikke kolonner for dato og beløp i CSV-filen. Overskriftene må inneholde f.eks. «Dato» og «Beløp», eller «Inn» og «Ut».",
    );
  }
  const transactions: BankTransactionInput[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], delim);
    const get = (idx: number | undefined) => (idx === undefined ? "" : (cells[idx] ?? "").trim());
    const bookingDate = parseBankDate(get(map.date));
    if (!bookingDate) continue; // f.eks. saldolinjer og tomme linjer
    let amountOre: number | null;
    if (map.amount !== undefined && get(map.amount)) {
      amountOre = parseAmountOre(get(map.amount));
    } else {
      const inn = get(map.in) ? parseAmountOre(get(map.in)) : 0;
      const ut = get(map.out) ? parseAmountOre(get(map.out)) : 0;
      amountOre = inn === null || ut === null ? null : Math.abs(inn) - Math.abs(ut);
    }
    if (amountOre === null) throw new StatementError(`Linje ${i + 1}: ugyldig beløp`);
    if (amountOre === 0) continue;
    const description = [get(map.text), ...map.extraText.map(get)].filter(Boolean).join(" ").replace(/\s+/g, " ");
    const counterparty = get(map.counterparty) || undefined;
    const valueDate = parseBankDate(get(map.valueDate)) ?? undefined;
    transactions.push({
      bookingDate,
      valueDate,
      amountOre,
      description: description || counterparty || (amountOre > 0 ? "Innbetaling" : "Utbetaling"),
      counterparty,
      reference: get(map.kid) || kidFromText(description),
      bankRef: get(map.bankRef) || undefined,
    });
  }
  if (transactions.length === 0) throw new StatementError("Fant ingen transaksjoner i CSV-filen");
  const dates = transactions.map((t) => t.bookingDate).sort();
  return { format: "csv", fromDate: dates[0], toDate: dates[dates.length - 1], transactions };
}
