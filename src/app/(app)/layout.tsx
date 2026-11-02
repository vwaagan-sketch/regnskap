import type { ReactNode } from "react";
import { MobileNav, MobileTopBar, Sidebar, type NavProps } from "@/components/nav";
import { requireUser } from "@/db/context";
import { listUserCompanies } from "@/db/user-repo";
import { logout } from "../logg-inn/actions";
import { switchFirma } from "./firma/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { sql, user, company, role } = await requireUser();
  const companies = await listUserCompanies(sql, user.id);
  const nav: NavProps = {
    user: { name: user.name, email: user.email },
    company: company && role ? { id: company.id, name: company.name, role } : null,
    companies,
    logout,
    switchCompany: switchFirma,
  };
  return (
    <div className="min-h-dvh">
      <Sidebar {...nav} />
      <MobileTopBar {...nav} />
      <main className="pb-24 lg:pb-10 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
      <MobileNav company={nav.company} />
    </div>
  );
}
