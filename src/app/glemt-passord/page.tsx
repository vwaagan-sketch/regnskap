import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import ForgotForm from "./forgot-form";

export const dynamic = "force-dynamic";

export default function GlemtPassordPage() {
  return (
    <AuthShell
      title="Glemt passord"
      footer={<Link href="/logg-inn" className="font-medium text-indigo-600 hover:underline">Tilbake til innlogging</Link>}
    >
      <ForgotForm />
    </AuthShell>
  );
}
