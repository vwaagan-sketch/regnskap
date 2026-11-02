import Link from "next/link";
import { Download, Plus, Settings, Users, Wallet } from "lucide-react";
import { Alert, Badge, ButtonLink, Card, EmptyState, Money, PageHeader, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { getPayrollSettings, holidayPaySummary, listAMeldinger, listEmployees, listRuns, monthlyTotals } from "@/db/payroll-repo";
import { today } from "@/lib/http";
import { AGA_ZONE_LABEL, aMeldingDeadline, isActiveIn, paymentTerm } from "@/lib/payroll";
import AMeldingButton from "./a-melding-button";

const monthName = (period: string) =>
  new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" }).format(new Date(`${period}-15T12:00:00`));

export default async function LonnPage() {
  const { sql, company } = await requireContext();
  const now = today();
  const year = Number(now.slice(0, 4));
  const [settings, runs, months, meldinger, employees, holiday] = await Promise.all([
    getPayrollSettings(sql, company.id),
    listRuns(sql, company.id),
    monthlyTotals(sql, company.id),
    listAMeldinger(sql, company.id),
    listEmployees(sql, company.id),
    holidayPaySummary(sql, company.id, year),
  ]);

  const periods = new Map(months.map((m) => [m.period, m]));
  const current = now.slice(0, 7);
  if (!periods.has(current) && employees.some((e) => isActiveIn(e, current))) {
    periods.set(current, { period: current, runs: 0, gross_ore: "0", tax_ore: "0", aga_ore: "0" });
  }
  const periodList = [...periods.values()].sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12);

  return (
    <>
      <PageHeader
        title="Lønn"
        description={settings ? `${AGA_ZONE_LABEL[settings.aga_zone]} · feriepenger ${settings.holiday_pay_rate_bp === 1200 ? "12" : "10,2"} %` : "Lønnskjøring, feriepenger, arbeidsgiveravgift og a-melding."}
        actions={<>
          <ButtonLink href="/lonn/innstillinger" variant="ghost"><Settings className="h-4 w-4" /> Innstillinger</ButtonLink>
          <ButtonLink href="/lonn/ansatte" variant="secondary"><Users className="h-4 w-4" /> Ansatte ({employees.length})</ButtonLink>
          <ButtonLink href="/lonn/ny"><Plus className="h-4 w-4" /> Ny lønnskjøring</ButtonLink>
        </>}
      />

      {!settings && (
        <div className="mb-6"><Alert kind="warning">Legg inn <Link href="/lonn/innstillinger" className="font-medium underline">lønnsinnstillinger</Link> (virksomhetsnummer, sone og feriepengesats) før første lønnskjøring.</Alert></div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid h-fit gap-6">
          <Card title="Lønnskjøringer">
            {runs.length === 0 ? (
              <EmptyState icon={<Wallet className="h-6 w-6" />} title="Ingen lønnskjøringer ennå" text="Legg inn ansatte og kjør den første lønnen." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link href={`/lonn/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.run_no}. {r.description}</p>
                        <p className="text-xs text-slate-500">Utbetaling {formatDate(r.pay_date)} · {r.slips} {r.slips === 1 ? "ansatt" : "ansatte"}</p>
                      </div>
                      {r.reverses_run_id ? <Badge>Reversering</Badge>
                        : r.reversed_by ? <Badge color="red">Reversert</Badge>
                        : r.paid_date ? <Badge color="green">Utbetalt</Badge>
                        : <Badge color="amber">Ikke utbetalt</Badge>}
                      <div className="w-28 text-right">
                        <Money ore={r.net_ore} className="text-sm font-medium" />
                        <p className="text-xs text-slate-400">netto</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Feriepenger opptjent i ${year}`}>
            {holiday.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Ingen ansatte.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2 font-medium">Ansatt</th>
                    <th className="px-3 py-2 text-right font-medium">Grunnlag</th>
                    <th className="px-5 py-2 text-right font-medium">Feriepenger</th>
                  </tr>
                </thead>
                <tbody>
                  {holiday.map((h) => (
                    <tr key={h.employee_id} className="border-b border-slate-50">
                      <td className="px-5 py-2.5">{h.name}</td>
                      <td className="px-3 py-2.5 text-right"><Money ore={h.basis_ore} /></td>
                      <td className="px-5 py-2.5 text-right font-medium"><Money ore={h.holiday_pay_ore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="px-5 py-3 text-xs text-slate-500">Utbetales normalt i juni {year + 1}: legg inn «Feriepenger» og «Trekk i lønn for ferie» i junilønnen.</p>
          </Card>
        </div>

        <Card title="A-melding og terminer" className="h-fit">
          {periodList.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">Ingenting å rapportere ennå.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {periodList.map((m) => {
                const sent = meldinger.filter((a) => a.period === m.period);
                const latest = sent[0];
                const term = paymentTerm(m.period);
                return (
                  <li key={m.period} className="grid gap-2 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium capitalize">{monthName(m.period)}</p>
                        <p className="text-xs text-slate-500">A-melding innen {formatDate(aMeldingDeadline(m.period))}</p>
                      </div>
                      <AMeldingButton period={m.period} hasPrevious={!!latest} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 text-xs">
                      <dt className="text-slate-500">Forskuddstrekk</dt><dd className="text-right"><Money ore={m.tax_ore} /></dd>
                      <dt className="text-slate-500">Arbeidsgiveravgift</dt><dd className="text-right"><Money ore={m.aga_ore} /></dd>
                    </dl>
                    <p className="text-xs text-slate-400">Betales for {term.label} innen {formatDate(term.deadline)}.</p>
                    {latest && (
                      <a href={`/api/a-melding/${latest.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline">
                        <Download className="h-3.5 w-3.5" /> Last ned a-melding laget {latest.created_at}{sent.length > 1 ? ` (versjon ${sent.length})` : ""}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            A-meldingen lages som XML etter Skatteetatens format og sendes inn via Altinn eller ditt sluttbrukersystem. Direkte innsending er ikke på plass ennå.
          </p>
        </Card>
      </div>
    </>
  );
}
