import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Card, EmptyState, Money, PageHeader, cx, formatDate } from "@/components/ui";
import { requireContext } from "@/db/context";
import { accountBalances, accountLines, customerBalances, type AccountBalance } from "@/db/report-repo";
import { today } from "@/lib/http";
import PrintButton from "./print-button";

const TABS = [
  { id: "resultat", label: "Resultat" },
  { id: "balanse", label: "Balanse" },
  { id: "hovedbok", label: "Hovedbok" },
  { id: "kunder", label: "Kunder" },
] as const;

type Range = { from: string; to: string; label: string };
const sumRange = (rows: AccountBalance[], from: string, to: string, key: "closingOre" | "openingOre" = "closingOre") =>
  rows.filter((r) => r.number >= from && r.number <= to).reduce((s, r) => s + r[key], 0);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ rapport?: string; ar?: string; konto?: string }> }) {
  const { sql, company } = await requireContext();
  const sp = await searchParams;
  const thisYear = Number(today().slice(0, 4));
  const year = Number(sp.ar) || thisYear;
  const tab = TABS.find((t) => t.id === sp.rapport)?.id ?? "resultat";
  const range: Range = { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
  const href = (p: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ rapport: tab, ar: year, ...p })) if (v !== undefined) q.set(k, String(v));
    return `/rapporter?${q}`;
  };

  return (
    <>
      <PageHeader
        title="Rapporter"
        description={`${company.name} · org.nr. ${company.org_no}`}
        actions={
          <div className="no-print flex items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-medium">
              {[thisYear - 1, thisYear].map((y) => (
                <Link key={y} href={href({ ar: y, konto: sp.konto })} className={cx("rounded-lg px-3 py-1.5", y === year ? "bg-white shadow-sm" : "text-slate-500")}>{y}</Link>
              ))}
            </div>
            <PrintButton />
          </div>
        }
      />
      <nav className="no-print mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 text-sm font-medium">
        {TABS.map((t) => (
          <Link key={t.id} href={href({ rapport: t.id, konto: undefined })}
            className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2", t.id === tab ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "resultat" && <IncomeStatement sql={sql} companyId={company.id} year={year} />}
      {tab === "balanse" && <BalanceSheet sql={sql} companyId={company.id} range={range} />}
      {tab === "hovedbok" && <GeneralLedger sql={sql} companyId={company.id} range={range} account={sp.konto} href={href} />}
      {tab === "kunder" && <Customers sql={sql} companyId={company.id} range={range} />}
    </>
  );
}

type Sql = Awaited<ReturnType<typeof requireContext>>["sql"];

const RESULT_GROUPS = [
  { label: "Salgsinntekter og andre driftsinntekter", from: "3000", to: "3999", sign: -1 },
  { label: "Varekostnad", from: "4000", to: "4999", sign: 1 },
  { label: "Lønnskostnader", from: "5000", to: "5999", sign: 1 },
  { label: "Avskrivninger", from: "6000", to: "6099", sign: 1 },
  { label: "Andre driftskostnader", from: "6100", to: "7999", sign: 1 },
  { label: "Finansinntekter", from: "8000", to: "8099", sign: -1 },
  { label: "Finanskostnader", from: "8100", to: "8199", sign: 1 },
  { label: "Skattekostnad", from: "8300", to: "8399", sign: 1 },
] as const;

async function IncomeStatement({ sql, companyId, year }: { sql: Sql; companyId: number; year: number }) {
  const [cur, prev] = await Promise.all([
    accountBalances(sql, companyId, `${year}-01-01`, `${year}-12-31`),
    accountBalances(sql, companyId, `${year - 1}-01-01`, `${year - 1}-12-31`),
  ]);
  const g = (rows: AccountBalance[], i: number) => {
    const x = RESULT_GROUPS[i];
    return x.sign * sumRange(rows, x.from, x.to);
  };
  const totals = (rows: AccountBalance[]) => {
    const income = g(rows, 0);
    const costs = g(rows, 1) + g(rows, 2) + g(rows, 3) + g(rows, 4);
    const operating = income - costs;
    const financial = g(rows, 5) - g(rows, 6);
    const beforeTax = operating + financial;
    return { income, costs, operating, financial, beforeTax, result: beforeTax - g(rows, 7) };
  };
  const t = totals(cur);
  const p = totals(prev);
  if (!cur.some((r) => r.number >= "3000" && r.closingOre !== 0)) {
    return <Card><EmptyState icon={<BarChart3 className="h-6 w-6" />} title={`Ingen inntekter eller kostnader i ${year}`} /></Card>;
  }
  const accountRows = (i: number) => {
    const x = RESULT_GROUPS[i];
    return cur.filter((r) => r.number >= x.from && r.number <= x.to && (r.closingOre !== 0 || prev.find((q) => q.number === r.number)?.closingOre))
      .map((r) => ({ label: `${r.number} ${r.name}`, cur: x.sign * r.closingOre, prev: x.sign * (prev.find((q) => q.number === r.number)?.closingOre ?? 0) }));
  };
  return (
    <Card title={`Resultatregnskap ${year}`}>
      <ReportTable head={[String(year), String(year - 1)]} rows={[
        { section: "Driftsinntekter og driftskostnader" },
        ...accountRows(0),
        { label: "Sum driftsinntekter", cur: t.income, prev: p.income, total: true },
        ...[1, 2, 3, 4].flatMap((i) => {
          const rs = accountRows(i);
          return rs.length ? [{ sub: RESULT_GROUPS[i].label }, ...rs] : [];
        }),
        { label: "Sum driftskostnader", cur: t.costs, prev: p.costs, total: true },
        { label: "Driftsresultat", cur: t.operating, prev: p.operating, strong: true },
        ...(t.financial || p.financial ? [{ section: "Finansposter" }, ...accountRows(5), ...accountRows(6).map((r) => ({ ...r, cur: -r.cur, prev: -r.prev })),
          { label: "Netto finansposter", cur: t.financial, prev: p.financial, total: true }] : []),
        { label: "Ordinært resultat før skattekostnad", cur: t.beforeTax, prev: p.beforeTax, strong: true },
        ...accountRows(7).map((r) => ({ ...r, cur: -r.cur, prev: -r.prev })),
        { label: "Årsresultat", cur: t.result, prev: p.result, strong: true },
      ]} />
    </Card>
  );
}

async function BalanceSheet({ sql, companyId, range }: { sql: Sql; companyId: number; range: Range }) {
  const rows = await accountBalances(sql, companyId, range.from, range.to);
  const result = -sumRange(rows, "3000", "8999");
  const list = (from: string, to: string, sign: number) =>
    rows.filter((r) => r.number >= from && r.number <= to && r.closingOre !== 0).map((r) => ({ label: `${r.number} ${r.name}`, cur: sign * r.closingOre }));
  const fixed = sumRange(rows, "1000", "1399");
  const current = sumRange(rows, "1400", "1999");
  const equity = -sumRange(rows, "2000", "2099") + result;
  const longDebt = -sumRange(rows, "2100", "2299");
  const shortDebt = -sumRange(rows, "2300", "2999");
  const assets = fixed + current;
  const liabilities = equity + longDebt + shortDebt;
  const upTo = range.to > today() ? today() : range.to;
  return (
    <Card title={`Balanse per ${formatDate(upTo)}`}>
      <ReportTable head={["Beløp"]} rows={[
        { section: "Eiendeler" },
        ...(fixed ? [{ sub: "Anleggsmidler" }, ...list("1000", "1399", 1), { label: "Sum anleggsmidler", cur: fixed, total: true }] : []),
        { sub: "Omløpsmidler" }, ...list("1400", "1999", 1), { label: "Sum omløpsmidler", cur: current, total: true },
        { label: "Sum eiendeler", cur: assets, strong: true },
        { section: "Egenkapital og gjeld" },
        { sub: "Egenkapital" }, ...list("2000", "2099", -1), { label: "Årets resultat (ikke disponert)", cur: result },
        { label: "Sum egenkapital", cur: equity, total: true },
        ...(longDebt ? [{ sub: "Langsiktig gjeld" }, ...list("2100", "2299", -1), { label: "Sum langsiktig gjeld", cur: longDebt, total: true }] : []),
        { sub: "Kortsiktig gjeld" }, ...list("2300", "2999", -1), { label: "Sum kortsiktig gjeld", cur: shortDebt, total: true },
        { label: "Sum egenkapital og gjeld", cur: liabilities, strong: true },
      ]} />
      {assets !== liabilities && <p className="px-5 pb-4 text-sm text-rose-600">Balansen går ikke opp. Differanse: <Money ore={assets - liabilities} /></p>}
    </Card>
  );
}

async function GeneralLedger({ sql, companyId, range, account, href }: { sql: Sql; companyId: number; range: Range; account?: string; href: (p: Record<string, string | number | undefined>) => string }) {
  const rows = (await accountBalances(sql, companyId, range.from, range.to)).filter((r) => r.openingOre || r.debitOre || r.creditOre);
  const selected = rows.find((r) => r.number === account);
  if (!selected) {
    if (!rows.length) return <Card><EmptyState icon={<BarChart3 className="h-6 w-6" />} title={`Ingen posteringer i ${range.label}`} /></Card>;
    return (
      <Card title={`Hovedbok ${range.label}`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-xs text-slate-500"><tr className="border-b border-slate-100">
              <th className="px-5 py-2 text-left font-medium">Konto</th><th className="px-3 py-2 text-right font-medium">Inngående</th>
              <th className="px-3 py-2 text-right font-medium">Debet</th><th className="px-3 py-2 text-right font-medium">Kredit</th><th className="px-5 py-2 text-right font-medium">Utgående</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.number} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-2"><Link href={href({ konto: r.number })} className="font-medium text-indigo-700 hover:underline">{r.number}</Link> {r.name}</td>
                  <td className="px-3 py-2 text-right"><Money ore={r.openingOre} /></td>
                  <td className="px-3 py-2 text-right"><Money ore={r.debitOre} /></td>
                  <td className="px-3 py-2 text-right"><Money ore={r.creditOre} /></td>
                  <td className="px-5 py-2 text-right font-medium"><Money ore={r.closingOre} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
  const lines = await accountLines(sql, companyId, selected.number, range.from, range.to);
  let running = selected.openingOre;
  return (
    <Card title={`${selected.number} ${selected.name} · ${range.label}`} action={<Link href={href({ konto: undefined })} className="no-print text-sm font-medium text-indigo-600">Alle kontoer</Link>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-xs text-slate-500"><tr className="border-b border-slate-100">
            <th className="px-5 py-2 text-left font-medium">Dato</th><th className="px-3 py-2 text-left font-medium">Bilag</th><th className="px-3 py-2 text-left font-medium">Tekst</th>
            <th className="px-3 py-2 text-right font-medium">Beløp</th><th className="px-5 py-2 text-right font-medium">Saldo</th>
          </tr></thead>
          <tbody>
            <tr className="bg-slate-50 text-slate-500"><td className="px-5 py-2" colSpan={4}>Inngående saldo</td><td className="px-5 py-2 text-right"><Money ore={selected.openingOre} /></td></tr>
            {lines.map((l, i) => {
              running += l.amountOre;
              return (
                <tr key={i} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-5 py-2 tabular-nums">{formatDate(l.date)}</td>
                  <td className="px-3 py-2 tabular-nums">{l.voucherNo}</td>
                  <td className="px-3 py-2">{l.description}{l.vatCode ? <span className="ml-1 text-xs text-slate-400">MVA-kode {l.vatCode}</span> : null}</td>
                  <td className="px-3 py-2 text-right"><Money ore={l.amountOre} /></td>
                  <td className="px-5 py-2 text-right"><Money ore={running} /></td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-200 font-semibold"><td className="px-5 py-2" colSpan={4}>Utgående saldo</td><td className="px-5 py-2 text-right"><Money ore={selected.closingOre} /></td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function Customers({ sql, companyId, range }: { sql: Sql; companyId: number; range: Range }) {
  const rows = (await customerBalances(sql, companyId, range.from, range.to)).filter((r) => r.openingOre || r.debitOre || r.creditOre);
  if (!rows.length) return <Card><EmptyState icon={<BarChart3 className="h-6 w-6" />} title={`Ingen kundebevegelser i ${range.label}`} /></Card>;
  const sum = (k: "openingOre" | "debitOre" | "creditOre" | "closingOre") => rows.reduce((s, r) => s + r[k], 0);
  return (
    <Card title={`Kundespesifikasjon ${range.label}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-xs text-slate-500"><tr className="border-b border-slate-100">
            <th className="px-5 py-2 text-left font-medium">Kunde</th><th className="px-3 py-2 text-right font-medium">Inngående</th>
            <th className="px-3 py-2 text-right font-medium">Fakturert</th><th className="px-3 py-2 text-right font-medium">Innbetalt/kreditert</th><th className="px-5 py-2 text-right font-medium">Utestående</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.customerNo} className="border-t border-slate-100">
                <td className="px-5 py-2"><span className="tabular-nums text-slate-500">{r.customerNo}</span> {r.name}</td>
                <td className="px-3 py-2 text-right"><Money ore={r.openingOre} /></td>
                <td className="px-3 py-2 text-right"><Money ore={r.debitOre} /></td>
                <td className="px-3 py-2 text-right"><Money ore={r.creditOre} /></td>
                <td className="px-5 py-2 text-right font-medium"><Money ore={r.closingOre} /></td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 font-semibold">
              <td className="px-5 py-2">Sum (skal stemme med konto 1500)</td>
              <td className="px-3 py-2 text-right"><Money ore={sum("openingOre")} /></td>
              <td className="px-3 py-2 text-right"><Money ore={sum("debitOre")} /></td>
              <td className="px-3 py-2 text-right"><Money ore={sum("creditOre")} /></td>
              <td className="px-5 py-2 text-right"><Money ore={sum("closingOre")} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type Row =
  | { section: string }
  | { sub: string }
  | { label: string; cur: number; prev?: number; total?: boolean; strong?: boolean };

function ReportTable({ head, rows }: { head: string[]; rows: Row[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-slate-500">
        <tr className="border-b border-slate-100"><th />{head.map((h) => <th key={h} className="px-5 py-2 text-right font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          if ("section" in r) return <tr key={i} className="bg-slate-50"><td colSpan={head.length + 1} className="px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{r.section}</td></tr>;
          if ("sub" in r) return <tr key={i}><td colSpan={head.length + 1} className="px-5 pb-1 pt-3 text-xs font-semibold text-slate-600">{r.sub}</td></tr>;
          return (
            <tr key={i} className={cx(r.total && "border-t border-slate-200 font-medium", r.strong && "border-t-2 border-slate-300 font-semibold")}>
              <td className={cx("py-1.5 pr-3", r.total || r.strong ? "px-5" : "pl-8")}>{r.label}</td>
              <td className="px-5 py-1.5 text-right"><Money ore={r.cur} /></td>
              {head.length > 1 && <td className="px-5 py-1.5 text-right text-slate-500"><Money ore={r.prev ?? 0} /></td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
