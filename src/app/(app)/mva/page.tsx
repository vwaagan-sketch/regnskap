import Link from "next/link";
import { ExternalLink, Percent } from "lucide-react";
import { Alert, Badge, Card, EmptyState, Money, PageHeader, cx, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { can } from "@/lib/auth/roles";
import { vatLines } from "@/db/report-repo";
import { getSettlement } from "@/db/vat-repo";
import { today } from "@/lib/http";
import { TERMS, buildVatReport, termOf, termPeriod } from "@/lib/vat-report";
import SettleButton from "./settle-button";

export default async function VatPage({ searchParams }: { searchParams: Promise<{ ar?: string; termin?: string }> }) {
  const { sql, company, role } = await requireContext();
  const sp = await searchParams;
  const now = today();
  const thisYear = Number(now.slice(0, 4));
  const year = Number(sp.ar) || thisYear;
  const term = TERMS.find((t) => t.id === sp.termin)?.id ?? (year === thisYear ? termOf(now) : "6");
  const period = termPeriod(year, term)!;
  const [lines, settlement] = await Promise.all([vatLines(sql, company.id, period.from, period.to), getSettlement(sql, company.id, year, term)]);
  const report = buildVatReport(lines);
  const ended = period.to < now;
  const href = (y: number, t: string) => `/mva?ar=${y}&termin=${t}`;

  return (
    <>
      <PageHeader title="MVA-melding" description="Oppstilling per MVA-kode slik den føres i MVA-meldingen til Skatteetaten." />
      {!company.vat_registered && (
        <div className="mb-6"><Alert kind="warning">Firmaet er ikke registrert i Merverdiavgiftsregisteret, og skal ikke levere MVA-melding.</Alert></div>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
          {[thisYear - 1, thisYear].map((y) => (
            <Link key={y} href={href(y, term)} className={cx("rounded-lg px-3 py-1.5", y === year ? "bg-white shadow-sm" : "text-slate-500")}>{y}</Link>
          ))}
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 text-sm font-medium">
          {TERMS.map((t) => (
            <Link key={t.id} href={href(year, t.id)} className={cx("whitespace-nowrap rounded-lg px-3 py-1.5", t.id === term ? "bg-white shadow-sm" : "text-slate-500")}>
              {t.id === "aar" ? "År" : `${t.id}. termin`}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={`${period.label} · ${formatDate(period.from)}–${formatDate(period.to)}`}
          action={settlement ? <Badge color="green">Avsluttet, bilag {settlement.voucher_no}</Badge> : ended ? <Badge color="amber">Ikke avsluttet</Badge> : <Badge>Pågår</Badge>}>
          {report.lines.length === 0 ? (
            <EmptyState icon={<Percent className="h-6 w-6" />} title="Ingen MVA-pliktige posteringer i terminen" text="Meldingen skal likevel leveres, med null i alle felt." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-2 text-left font-medium">Kode</th>
                    <th className="px-3 py-2 text-left font-medium">Beskrivelse</th>
                    <th className="px-3 py-2 text-right font-medium">Grunnlag</th>
                    <th className="px-3 py-2 text-right font-medium">Sats</th>
                    <th className="px-5 py-2 text-right font-medium">MVA</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((l) => (
                    <tr key={l.code} className="border-t border-slate-100">
                      <td className="px-5 py-2.5 font-medium tabular-nums">{l.code}</td>
                      <td className="px-3 py-2.5">{l.label}</td>
                      <td className="px-3 py-2.5 text-right"><Money ore={l.baseOre} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-500">{l.rate} %</td>
                      <td className="px-5 py-2.5 text-right"><Money ore={l.vatOre} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <td className="px-5 py-3" colSpan={4}>{report.payableOre >= 0 ? "Å betale" : "Til gode"}</td>
                    <td className="px-5 py-3 text-right"><Money ore={Math.abs(report.payableOre)} /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <div className="grid h-fit gap-6">
          <Card title="Sammendrag">
            <dl className="grid gap-2 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Utgående MVA</dt><dd><Money ore={report.outputOre} /></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Inngående MVA (fradrag)</dt><dd><Money ore={-report.inputOre} /></dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold"><dt>{report.payableOre >= 0 ? "Å betale" : "Til gode"}</dt><dd><Money ore={Math.abs(report.payableOre)} /></dd></div>
            </dl>
            {!settlement && company.vat_registered && can(role, "skriv") && (
              <div className="border-t border-slate-100 p-5">
                <SettleButton year={year} term={term} disabled={!ended || report.lines.length === 0} />
                <p className="mt-2 text-xs text-slate-500">
                  {ended ? "Flytter MVA-saldoene for terminen til 2740 Oppgjørskonto MVA. Gjør dette når meldingen er sendt." : "Terminen kan avsluttes når den er over."}
                </p>
              </div>
            )}
          </Card>
          <Card title="Slik sender du meldingen">
            <ol className="grid list-decimal gap-2 p-5 pl-9 text-sm text-slate-600">
              <li>Logg inn på skatteetaten.no med BankID og velg «MVA-melding».</li>
              <li>Før inn grunnlag og MVA per kode fra tabellen. Fradrag føres med minus.</li>
              <li>Send innen fristen: 10. april, 10. juni, 31. august, 10. oktober, 10. desember og 10. februar.</li>
              <li>Avslutt terminen her, og bokfør betalingen som et bilag: debet 2740, kredit 1920.</li>
            </ol>
            <a href="https://www.skatteetaten.no/bedrift-og-organisasjon/avgifter/mva/rapportering-og-betaling/" target="_blank" rel="noreferrer"
              className="flex items-center gap-1 border-t border-slate-100 px-5 py-3 text-sm font-medium text-indigo-600">
              Skatteetaten om MVA-meldingen <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Card>
        </div>
      </div>
    </>
  );
}
