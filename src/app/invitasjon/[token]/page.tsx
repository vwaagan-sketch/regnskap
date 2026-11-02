import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/ui";
import { getSql } from "@/db/client";
import { getAuth } from "@/db/context";
import { getInvitation } from "@/db/user-repo";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/roles";
import AcceptForm from "./accept-form";

export const dynamic = "force-dynamic";

export default async function InvitasjonPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sql = getSql();
  const inv = sql ? await getInvitation(sql, token) : null;
  if (!inv) {
    return (
      <AuthShell title="Invitasjonen virker ikke" footer={<Link href="/logg-inn" className="font-medium text-indigo-600 hover:underline">Gå til innlogging</Link>}>
        <Alert kind="warning">Lenken er ugyldig, allerede brukt, trukket tilbake eller utløpt. Be administratoren om en ny invitasjon.</Alert>
      </AuthShell>
    );
  }
  const auth = await getAuth();
  const sameUser = auth && auth.user.email.toLowerCase() === inv.email.toLowerCase();
  const mode = sameUser ? "innlogget" : inv.user_exists ? "eksisterende" : "ny";
  return (
    <AuthShell title={`Bli med i ${inv.company_name}`} subtitle={`Invitasjon til ${inv.email}`}>
      <div className="mb-5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <p className="font-medium text-slate-800">{ROLE_LABELS[inv.role]}</p>
        <p className="text-slate-500">{ROLE_DESCRIPTIONS[inv.role]}</p>
      </div>
      {auth && !sameUser && (
        <div className="mb-4">
          <Alert kind="warning">Du er logget inn som {auth.user.email}, men invitasjonen gjelder {inv.email}.</Alert>
        </div>
      )}
      {mode === "eksisterende" && <p className="mb-4 text-sm text-slate-600">Du har allerede en bruker. Skriv inn passordet ditt for å godta.</p>}
      <AcceptForm token={token} mode={mode} email={inv.email} />
    </AuthShell>
  );
}
