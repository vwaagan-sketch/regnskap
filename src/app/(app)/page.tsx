import Link from "next/link";
import { ArrowRight, Banknote, BookOpen, Camera, FileText, Landmark, Percent, Plus, TrendingUp, Upload } from "lucide-react";
import { Alert, Card, EmptyState, Money, PageHeader, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { can } from "@/lib/auth/roles";
import { dashboardStats, listEntries } from "@/db/ledger-repo";
import { formatKr } from "@/lib/money";
import { today } from "@/lib/http";

const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

function Kpi({ label, ore, icon, hint }: { label: string; ore: string; icon: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className="rounded-lg bg-slate-100 p-1.5 text-slate-500">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight"><Money ore={ore} /></p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

const QUICK = [
  { href: "/kvittering", label: "Kvittering", text: "Ta bilde og bokfør", icon: Camera, color: "from-indigo-500 to-violet-500" },
  { href: "/fakturaer/ny", label: "Faktura", text: "Send en ny faktura", icon: FileText, color: "from-emerald-500 to-teal-500" },
  { href: "/bilag/ny", label: "Bilag", text: "Fri postering", icon: Plus, color: "from-amber-500 to-orange-500" },
  { href: "/arkiv", label: "Arkiv", text: "Last opp dokumenter", icon: Upload, color: "from-sky-500 to-cyan-500" },
];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ "ingen-tilgang"?: string }> }) {
  const { sql, company, user, role } = await requireContext();
  const denied = Boolean((await searchParams)["ingen-tilgang"]);
  const quick = can(role, "skriv") ? QUICK : [];
  const year = Number(today().slice(0, 4));
  const [stats, recent] = await Promise.all([dashboardStats(sql, company.id, year), listEntries(sql, company.id, 6)]);
  const max = Math.max(1, ...stats.months.flatMap((m) => [Number(m.income), Number(m.costs)]));

  return (
    <>
      <PageHeader title={`Hei, ${user.name.split(" ")[0]}`} description={`${company.name} · regnskapsåret ${year}`} />
      {denied && (
        <div className="mb-6">
          <Alert kind="warning">Du har ikke tilgang til siden du prøvde å åpne. Spør en administrator i firmaet om du trenger mer tilgang.</Alert>
        </div>
      )}

      {quick.length > 0 && <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quick.map(({ href, label, text, icon: Icon, color }) => (
          <Link key={href} href={href} className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <span className={`inline-grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white ${color}`}><Icon className="h-5 w-5" /></span>
            <p className="mt-3 text-sm font-semibold">{label}</p>
            <p className="text-xs text-slate-500">{text}</p>
          </Link>
        ))}
      </div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Bank og kontanter" ore={stats.bank} icon={<Landmark className="h-4 w-4" />} />
        <Kpi label="Kunder skylder" ore={stats.receivables} icon={<Banknote className="h-4 w-4" />} />
        <Kpi label={`Resultat ${year}`} ore={stats.result} icon={<TrendingUp className="h-4 w-4" />} hint="Inntekter minus kostnader" />
        <Kpi label="MVA å betale" ore={stats.vat} icon={<Percent className="h-4 w-4" />} hint="Utgående minus inngående" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Inntekter og kostnader per måned">
          <div className="p-5">
            <div className="flex h-48 items-end gap-1.5">
              {MONTHS.map((m, i) => {
                const row = stats.months.find((r) => r.month === i + 1);
                const inc = Number(row?.income ?? 0), cost = Number(row?.costs ?? 0);
                return (
                  <div key={m} className="flex h-full flex-1 flex-col justify-end gap-1" title={`${m}: inntekt ${formatKr(inc)}, kostnad ${formatKr(cost)}`}>
                    <div className="flex flex-1 items-end justify-center gap-0.5">
                      <div className="w-1/2 rounded-t bg-indigo-500" style={{ height: `${(Math.max(0, inc) / max) * 100}%` }} />
                      <div className="w-1/2 rounded-t bg-slate-300" style={{ height: `${(Math.max(0, cost) / max) * 100}%` }} />
                    </div>
                    <span className="text-center text-[10px] text-slate-400">{m}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" /> Inntekter</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" /> Kostnader</span>
            </div>
          </div>
        </Card>

        <Card title="Siste bilag" action={<Link href="/bilag" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">Alle <ArrowRight className="h-3 w-3" /></Link>}>
          {recent.length === 0 ? (
            <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Ingen bilag ennå" text="Start med å ta bilde av en kvittering." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xs font-semibold tabular-nums text-slate-400">#{e.voucher_no}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{e.description}</span>
                    <span className="text-xs text-slate-400">{formatDate(e.entry_date)}</span>
                  </span>
                  <Money ore={e.lines.reduce((s, l) => s + Math.max(0, Number(l.amount_ore)), 0)} className="text-sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
