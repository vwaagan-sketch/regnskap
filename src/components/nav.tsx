"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive, BookOpen, Building2, Camera, FileText, LayoutDashboard, ListTree, LogOut, Package, Scale, Users,
} from "lucide-react";
import { cx } from "./ui";

export const NAV = [
  { href: "/", label: "Oversikt", icon: LayoutDashboard },
  { href: "/kvittering", label: "Kvittering", icon: Camera },
  { href: "/bilag", label: "Bilag", icon: BookOpen },
  { href: "/arkiv", label: "Arkiv", icon: Archive },
  { href: "/fakturaer", label: "Fakturaer", icon: FileText },
  { href: "/kunder", label: "Kunder", icon: Users },
  { href: "/varer", label: "Varer", icon: Package },
  { href: "/kontoplan", label: "Kontoplan", icon: ListTree },
  { href: "/saldobalanse", label: "Saldobalanse", icon: Scale },
  { href: "/firma", label: "Firma", icon: Building2 },
];

const MOBILE = ["/", "/kvittering", "/bilag", "/arkiv", "/fakturaer"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ companyName, logout }: { companyName: string | null; logout: () => Promise<void> }) {
  const pathname = usePathname();
  return (
    <aside className="no-print fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">R</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Regnskap</p>
          <p className="truncate text-xs text-slate-500">{companyName ?? "Ikke satt opp"}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => (
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

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {NAV.filter((n) => MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => (
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

export function MobileTopBar({ logout }: { logout: () => Promise<void> }) {
  const pathname = usePathname();
  return (
    <header className="no-print sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">R</div>
        <span className="text-sm font-semibold">Regnskap</span>
      </div>
      <div className="flex items-center gap-1">
        {NAV.filter((n) => !MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => (
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
