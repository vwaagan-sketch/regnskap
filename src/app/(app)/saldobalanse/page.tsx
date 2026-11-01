import Link from "next/link";
import { Scale } from "lucide-react";
import { Card, EmptyState, Money, PageHeader, cx } from "@/components/ui";
import { requireContext } from "@/db/context";
import { trialBalanceForYear } from "@/db/ledger-repo";
import { today } from "@/lib/http";

const GROUPS = [
  { from: "1000", to: "1999", label: "Eiendeler" },
  { from: "2000", to: "2999", label: "Egenkapital og gjeld" },
  { from: "3000", to: "3999", label: "Inntekter" },
  { from: "4000", to: "7999", label: "Kostnader" },
  { from: "8000", to: "8999", label: "Finans" },
];

export default async function SaldobalansePage({ searchParams }: { searchParams: Promise<{ ar?: string }> }) {
  const { sql, company } = await requireContext();
  const thisYear = Number(today().slice(0, 4));
  const year = Number((await searchParams).ar) || thisYear;
  const rows = await trialBalanceForYear(sql, company.id, year);
  const total = rows.reduce((s, r) => s + Number(r.balance_ore), 0);

  return (
    <>
      <PageHeader title="Saldobalanse" description="Bevegelser per konto i året. Positive tall er debet, negative er kredit."
        actions={
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
            {[thisYear - 1, thisYear].map((y) => (
              <Link key={y} href={`/saldobalanse?ar=${y}`} className={cx("rounded-lg px-3 py-1.5", y === year ? "bg-white shadow-sm" : "text-slate-500")}>{y}</Link>
            ))}
          </div>
        } />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Scale className="h-6 w-6" />} title={`Ingen posteringer i ${year}`} />
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {GROUPS.map((g) => {
                const rs = rows.filter((r) => r.account >= g.from && r.account <= g.to);
                if (rs.length === 0) return null;
                const sum = rs.reduce((s, r) => s + Number(r.balance_ore), 0);
                return (
                  <FragmentGroup key={g.label} label={g.label} sum={sum}>
                    {rs.map((r) => (
                      <tr key={r.account} className="border-t border-slate-100">
                        <td className="w-20 px-5 py-2 tabular-nums text-slate-500">{r.account}</td>
                        <td className="py-2">{r.name}</td>
                        <td className="px-5 py-2 text-right"><Money ore={r.balance_ore} /></td>
                      </tr>
                    ))}
                  </FragmentGroup>
                );
              })}
              <tr className="border-t-2 border-slate-200 font-semibold">
                <td className="px-5 py-3" colSpan={2}>Sum (skal være 0)</td>
                <td className="px-5 py-3 text-right"><Money ore={total} /></td>
              </tr>
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function FragmentGroup({ label, sum, children }: { label: string; sum: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-slate-50">
        <td colSpan={2} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</td>
        <td className="px-5 py-2 text-right text-xs font-semibold text-slate-500"><Money ore={sum} /></td>
      </tr>
      {children}
    </>
  );
}
