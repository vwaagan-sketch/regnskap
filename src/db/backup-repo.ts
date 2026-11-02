import type postgres from "postgres";
import { zipSync, strToU8 } from "fflate";
import type { CompanyRow } from "./company-repo";
import { exportSaft } from "./saft-repo";
import { buildEhf } from "@/lib/ehf";
import type { InvoiceInput, InvoiceTotals } from "@/lib/invoice";
import { today } from "@/lib/http";

const safe = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80);

/**
 * Full sikkerhetskopi: SAF-T per år, alle bilag i originalformat, fakturaer som JSON og EHF,
 * og revisjonsloggen. Filen kan leses uten dette programmet (bokføringsloven § 13 a: leselig i hele oppbevaringstiden).
 */
export async function buildBackup(sql: postgres.Sql, company: CompanyRow, contactName: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const index: string[] = [];

  const years = await sql<{ year: number }[]>`
    SELECT DISTINCT extract(year FROM entry_date)::int AS year FROM journal_entry WHERE company_id = ${company.id} ORDER BY 1`;
  for (const { year } of years) {
    files[`saft/SAF-T_${company.org_no}_${year}.xml`] = strToU8(await exportSaft(sql, company, { year, contactName }));
  }

  const docs = await sql<{ id: string; filename: string | null; media_type: string; content: Buffer; document_date: string | null; created: string; sha256: string; retain_until: string; voucher_no: number | null }[]>`
    SELECT d.id::text, d.filename, b.media_type, b.content, d.sha256,
      to_char(d.document_date, 'YYYY-MM-DD') AS document_date, to_char(d.created_at, 'YYYY-MM-DD') AS created,
      to_char(d.retain_until, 'YYYY-MM-DD') AS retain_until,
      (SELECT min(e.voucher_no) FROM journal_entry e WHERE e.document_id = d.id) AS voucher_no
    FROM document d JOIN document_blob b ON b.document_id = d.id
    WHERE d.company_id = ${company.id} ORDER BY d.created_at`;
  for (const d of docs) {
    const year = (d.document_date ?? d.created).slice(0, 4);
    const prefix = d.voucher_no ? `bilag-${d.voucher_no}` : `ubokfort-${d.id.slice(0, 8)}`;
    const path = `bilag/${year}/${prefix}_${safe(d.filename ?? d.id)}`;
    files[path] = new Uint8Array(d.content);
    index.push([path, d.voucher_no ?? "", d.document_date ?? "", d.retain_until, d.sha256].join(";"));
  }
  files["bilag/oversikt.csv"] = strToU8(["fil;bilagsnr;dato;oppbevares_til;sha256", ...index].join("\n"));

  const invoices = await sql<{ number: number; kind: string; snapshot: { invoice: InvoiceInput; totals: InvoiceTotals; customerNo: number } }[]>`
    SELECT number, kind, snapshot FROM invoice WHERE company_id = ${company.id} ORDER BY number`;
  for (const inv of invoices) {
    const name = `${inv.kind === "credit_note" ? "kreditnota" : "faktura"}-${inv.number}`;
    files[`fakturaer/${name}.json`] = strToU8(JSON.stringify(inv.snapshot, null, 2));
    if (inv.snapshot.invoice.buyer.orgNo) {
      files[`fakturaer/ehf/${name}.xml`] = strToU8(buildEhf(inv.snapshot.invoice, inv.snapshot.totals, String(inv.snapshot.customerNo)));
    }
  }

  const runs = await sql<{ run_no: number; pay_date: string }[]>`
    SELECT r.run_no, to_char(r.pay_date, 'YYYY-MM-DD') AS pay_date,
      r.description, r.gross_ore::text, r.tax_ore::text, r.net_ore::text, r.aga_ore::text, r.holiday_pay_ore::text,
      (SELECT json_agg(json_build_object('ansatt', s.employee_snapshot, 'brutto_ore', s.gross_ore, 'trekk_ore', s.tax_ore,
         'netto_ore', s.net_ore, 'aga_ore', s.aga_ore, 'feriepenger_ore', s.holiday_pay_ore,
         'linjer', (SELECT json_agg(l ORDER BY l.id) FROM payslip_line l WHERE l.payslip_id = s.id)) ORDER BY s.id)
       FROM payslip s WHERE s.run_id = r.id) AS lonnsslipper
    FROM payroll_run r WHERE r.company_id = ${company.id} ORDER BY r.run_no`;
  for (const r of runs) files[`lonn/lonnskjoring-${r.run_no}_${r.pay_date}.json`] = strToU8(JSON.stringify(r, null, 2));
  const meldinger = await sql<{ period: string; melding_id: string; xml: string }[]>`
    SELECT period, melding_id::text, xml FROM a_melding WHERE company_id = ${company.id} ORDER BY id`;
  for (const m of meldinger) files[`lonn/a-melding/a-melding-${m.period}-${m.melding_id.slice(0, 8)}.xml`] = strToU8(m.xml);

  const audit = await sql`SELECT actor, action, entity, entity_id, data, at FROM audit_log WHERE company_id = ${company.id} ORDER BY id`;
  files["revisjonslogg.json"] = strToU8(JSON.stringify(audit, null, 2));

  files["LESMEG.txt"] = strToU8([
    `Sikkerhetskopi av regnskapet til ${company.name} (org.nr. ${company.org_no})`,
    `Laget ${today()}.`,
    "",
    "saft/        Hovedbok, kontoplan, kunder og MVA-koder per år i SAF-T Financial 1.30 (Skatteetatens standardformat).",
    "bilag/       Originale bilag (kvitteringer, regninger, vedlegg). Filnavnet starter med bilagsnummeret.",
    "             oversikt.csv viser oppbevaringsfrist og SHA-256 for hvert dokument.",
    "fakturaer/   Utstedte fakturaer og kreditnotaer slik de ble utstedt (JSON), og som EHF (XML) for bedriftskunder.",
    "lonn/        Lønnskjøringer med lønnsslipper (JSON) og innsendte a-meldinger (XML).",
    "revisjonslogg.json  Alle registreringer i programmet med tidspunkt.",
    "",
    "Regnskapsmateriale skal oppbevares i 5 år etter regnskapsårets slutt (bokføringsloven § 13).",
  ].join("\n"));

  return zipSync(files, { level: 6 });
}
