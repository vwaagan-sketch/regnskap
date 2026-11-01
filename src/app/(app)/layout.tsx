import type { ReactNode } from "react";
import { MobileNav, MobileTopBar, Sidebar } from "@/components/nav";
import { getSql } from "@/db/client";
import { getCompany } from "@/db/company-repo";
import { logout } from "../logg-inn/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sql = getSql();
  let companyName: string | null = null;
  if (sql) {
    try {
      companyName = (await getCompany(sql))?.name ?? null;
    } catch {
      companyName = null;
    }
  }
  return (
    <div className="min-h-dvh">
      <Sidebar companyName={companyName} logout={logout} />
      <MobileTopBar logout={logout} />
      <main className="pb-24 lg:pb-10 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
      <MobileNav />
    </div>
  );
}
