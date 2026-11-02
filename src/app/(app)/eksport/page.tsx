import { Archive, Download, FileCode2, ShieldCheck } from "lucide-react";
import { Card, Field, PageHeader, formatDate, inputClass } from "@/components/ui";
import { requireContext } from "@/db/context";
import { today } from "@/lib/http";

const MONTHS = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];

export default async function ExportPage() {
  const { sql, company, user, role } = await requireContext();
  const [stats] = await sql<{ entries: number; documents: number; invoices: number; first_year: number | null; last_year: number | null; bytes: string }[]>`
    SELECT
      (SELECT count(*)::int FROM journal_entry WHERE company_id = ${company.id}) AS entries,
      (SELECT count(*)::int FROM document WHERE company_id = ${company.id}) AS documents,
      (SELECT count(*)::int FROM invoice WHERE company_id = ${company.id}) AS invoices,
      (SELECT min(extract(year FROM entry_date))::int FROM journal_entry WHERE company_id = ${company.id}) AS first_year,
      (SELECT max(extract(year FROM entry_date))::int FROM journal_entry WHERE company_id = ${company.id}) AS last_year,
      (SELECT coalesce(sum(size_bytes), 0)::text FROM document WHERE company_id = ${company.id}) AS bytes`;
  const thisYear = Number(today().slice(0, 4));
  const years = Array.from(new Set([thisYear, thisYear - 1, ...(stats.first_year ? [stats.first_year] : [])])).sort((a, b) => b - a);
  const keepUntil = stats.first_year ? `${stats.first_year + 5}-12-31` : null;

  return (
    <>
      <PageHeader title="Eksport og oppbevaring" description="Hent ut regnskapet i standardformat, og ta sikkerhetskopi av alt." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="SAF-T Regnskap">
          <form action="/api/eksport/saft" method="get" className="grid gap-4 p-5">
            <p className="text-sm text-slate-600">
              Hovedbok, kontoplan, kunder og MVA-koder i Skatteetatens standardformat (SAF-T Financial 1.30).
              Skatteetaten kan be om filen ved kontroll, og den brukes ved bytte av regnskapssystem.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="År">
                <select name="ar" defaultValue={thisYear} className={inputClass}>{years.map((y) => <option key={y}>{y}</option>)}</select>
              </Field>
              <Field label="Fra måned">
                <select name="fra" defaultValue={1} className={inputClass}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
              </Field>
              <Field label="Til måned">
                <select name="til" defaultValue={12} className={inputClass}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
              </Field>
            </div>
            <Field label="Kontaktperson" hint="Navnet står i filhodet som kontakt for regnskapet">
              <input name="kontakt" required defaultValue={user.name} placeholder="Fornavn Etternavn" className={inputClass} />
            </Field>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500">
              <FileCode2 className="h-4 w-4" /> Last ned SAF-T
            </button>
          </form>
        </Card>

        {role === "admin" && <Card title="Full sikkerhetskopi">
          <form action="/api/eksport/sikkerhetskopi" method="get" className="grid gap-4 p-5">
            <p className="text-sm text-slate-600">
              En ZIP-fil med SAF-T for hvert år, alle bilag i originalformat, alle fakturaer (også som EHF) og revisjonsloggen.
              Filen kan leses uten dette programmet. Ta en kopi minst én gang i måneden, og lagre den et annet sted enn her.
            </p>
            <Field label="Kontaktperson"><input name="kontakt" required defaultValue={user.name} placeholder="Fornavn Etternavn" className={inputClass} /></Field>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
              <Download className="h-4 w-4" /> Last ned sikkerhetskopi
            </button>
          </form>
        </Card>}

        <Card title="Oppbevaring" className="lg:col-span-2">
          <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Archive className="h-5 w-5" />} label="Bilag i hovedboken" value={stats.entries.toLocaleString("nb-NO")} />
            <Stat icon={<Archive className="h-5 w-5" />} label="Dokumenter i arkivet" value={`${stats.documents.toLocaleString("nb-NO")} (${(Number(stats.bytes) / 1048576).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB)`} />
            <Stat icon={<FileCode2 className="h-5 w-5" />} label="Utstedte fakturaer" value={stats.invoices.toLocaleString("nb-NO")} />
            <Stat icon={<ShieldCheck className="h-5 w-5" />} label="Eldste materiale oppbevares til" value={keepUntil ? formatDate(keepUntil) : "–"} />
          </div>
          <ul className="grid gap-2 border-t border-slate-100 p-5 text-sm text-slate-600">
            <li>• Regnskap og bilag oppbevares i 5 år etter regnskapsårets slutt (bokføringsloven § 13). Bokførte data kan ikke endres eller slettes i programmet.</li>
            <li>• Dataene lagres hos Render i Frankfurt. Bokføringsloven § 13 b tillater oppbevaring i et annet EØS-land, så lenge materialet er tilgjengelig fra Norge.</li>
            <li>• Hvert dokument har en SHA-256-sjekksum, slik at du kan kontrollere at originalen ikke er endret.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">{icon}</div>
      <div><p className="text-xs text-slate-500">{label}</p><p className="font-semibold tabular-nums">{value}</p></div>
    </div>
  );
}
