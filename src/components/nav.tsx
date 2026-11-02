"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive, BookOpen, Building2, Camera, Check, ChevronsUpDown, FileText, LayoutDashboard, ListTree, LogOut, Package, Plus,
  Scale, ShieldCheck, UserCircle, Users,
} from "lucide-react";
import { can, ROLE_LABELS, type Access, type Role } from "@/lib/auth/roles";
import { cx } from "./ui";

export interface NavCompany {
  id: number;
  name: string;
  role: Role;
}

export interface NavProps {
  user: { name: string; email: string };
  company: NavCompany | null;
  companies: NavCompany[];
  logout: () => Promise<void>;
  switchCompany: (form: FormData) => Promise<void>;
}

export const NAV: { href: string; label: string; icon: typeof Users; access?: Access }[] = [
  { href: "/", label: "Oversikt", icon: LayoutDashboard },
  { href: "/kvittering", label: "Kvittering", icon: Camera, access: "skriv" },
  { href: "/bilag", label: "Bilag", icon: BookOpen },
  { href: "/arkiv", label: "Arkiv", icon: Archive },
  { href: "/fakturaer", label: "Fakturaer", icon: FileText },
  { href: "/kunder", label: "Kunder", icon: Users },
  { href: "/varer", label: "Varer", icon: Package },
  { href: "/kontoplan", label: "Kontoplan", icon: ListTree },
  { href: "/saldobalanse", label: "Saldobalanse", icon: Scale },
  { href: "/firma", label: "Firma", icon: Building2, access: "admin" },
  { href: "/brukere", label: "Brukere", icon: ShieldCheck, access: "admin" },
];

function visibleNav(company: NavCompany | null) {
  if (!company) return [];
  return NAV.filter((n) => !n.access || can(company.role, n.access));
}

/** Viser aktivt firma, og lar brukeren bytte firma, legge til firma og åpne profilen. */
function CompanySwitcher({ user, company, companies, switchCompany, compact = false }: Omit<NavProps, "logout"> & { compact?: boolean }) {
  return (
    <details className="group relative">
      <summary
        className={cx(
          "flex cursor-pointer list-none items-center gap-2.5 rounded-xl hover:bg-slate-50 [&::-webkit-details-marker]:hidden",
          compact ? "px-1.5 py-1" : "px-3 py-2",
        )}
      >
        <div className={cx("grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white", compact ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm")}>
          {(company?.name ?? "R").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className={cx("truncate font-semibold text-slate-900", compact ? "max-w-[10rem] text-sm" : "text-sm")}>{company?.name ?? "Regnskap"}</p>
          {!compact && <p className="truncate text-xs text-slate-500">{user.name}</p>}
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
        <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-slate-400">Firma</p>
        {companies.map((c) => (
          <form key={c.id} action={switchCompany}>
            <input type="hidden" name="companyId" value={c.id} />
            <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-800">{c.name}</span>
                <span className="block text-xs text-slate-400">{ROLE_LABELS[c.role]}</span>
              </span>
              {c.id === company?.id && <Check className="h-4 w-4 text-indigo-600" />}
            </button>
          </form>
        ))}
        <Link href="/firma/ny" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <Plus className="h-4 w-4" /> Legg til firma
        </Link>
        <div className="my-1 border-t border-slate-100" />
        <Link href="/profil" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <UserCircle className="h-4 w-4" />
          <span className="min-w-0 flex-1 truncate">Min profil <span className="text-slate-400">· {user.email}</span></span>
        </Link>
      </div>
    </details>
  );
}

const MOBILE = ["/", "/kvittering", "/bilag", "/arkiv", "/fakturaer"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ logout, ...props }: NavProps) {
  const pathname = usePathname();
  return (
    <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="px-3 pt-3 pb-1">
        <CompanySwitcher {...props} />
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {visibleNav(props.company).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cx(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
              isActive(pathname, href) ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <form action={logout} className="border-t border-slate-100 p-3">
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-900">
          <LogOut className="h-4 w-4" /> Logg ut
        </button>
      </form>
    </aside>
  );
}

export function MobileNav({ company }: { company: NavCompany | null }) {
  const pathname = usePathname();
  const items = visibleNav(company).filter((n) => MOBILE.includes(n.href));
  if (items.length === 0) return null;
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-20 grid border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(pathname, href) ? "text-indigo-600" : "text-slate-500")}
        >
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileTopBar({ logout, ...props }: NavProps) {
  const pathname = usePathname();
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-2 backdrop-blur lg:hidden">
      <CompanySwitcher {...props} compact />
      <div className="flex min-w-0 items-center overflow-x-auto">
        {visibleNav(props.company).filter((n) => !MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-label={label} className={cx("rounded-lg p-2", isActive(pathname, href) ? "text-indigo-600" : "text-slate-500")}>
            <Icon className="h-5 w-5" />
          </Link>
        ))}
        <form action={logout}>
          <button aria-label="Logg ut" className="rounded-lg p-2 text-slate-500"><LogOut className="h-5 w-5" /></button>
        </form>
      </div>
    </header>
  );
}
