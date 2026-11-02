import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/db/context";
import { listUserCompanies } from "@/db/user-repo";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { PasswordForm, ProfileForm } from "./profile-forms";

export default async function ProfilPage() {
  const { sql, user } = await requireUser();
  const companies = await listUserCompanies(sql, user.id);
  return (
    <>
      <PageHeader title="Min profil" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm name={user.name} email={user.email} />
        <PasswordForm />
        <Card
          title="Mine firma"
          className="lg:col-span-2"
          action={<Link href="/firma/ny" className="text-sm font-medium text-indigo-600 hover:underline">Legg til firma</Link>}
        >
          <ul className="divide-y divide-slate-100">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="min-w-0 truncate">{c.name} <span className="text-slate-400">· {c.org_no}</span></span>
                <Badge>{ROLE_LABELS[c.role]}</Badge>
              </li>
            ))}
            {companies.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">Ingen firma ennå.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
