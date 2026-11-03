import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Alert } from "@/components/ui";
import { getSql } from "@/db/client";
import { getPasswordReset } from "@/db/user-repo";
import ResetForm from "./reset-form";

export const dynamic = "force-dynamic";

export default async function NyttPassordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sql = getSql();
  const reset = sql ? await getPasswordReset(sql, token) : null;
  if (!reset) {
    return (
      <AuthShell
        title="Lenken virker ikke"
        footer={<Link href="/glemt-passord" className="font-medium text-indigo-600 hover:underline">Be om en ny lenke</Link>}
      >
        <Alert kind="warning">Lenken er ugyldig, allerede brukt eller utløpt. Den virker i én time og kan bare brukes én gang.</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Velg nytt passord" subtitle={reset.email}>
      <ResetForm token={token} email={reset.email} />
    </AuthShell>
  );
}
