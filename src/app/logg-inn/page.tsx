import Link from "next/link";
import { AuthShell, signupOpen } from "@/components/auth-shell";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ neste?: string }> }) {
  const { neste } = await searchParams;
  return (
    <AuthShell
      title="Logg inn"
      subtitle="Faktura og regnskap"
      footer={signupOpen() && (
        <>Har du ikke konto? <Link href="/registrer" className="font-medium text-indigo-600 hover:underline">Registrer firmaet ditt</Link></>
      )}
    >
      <LoginForm next={neste ?? "/"} />
    </AuthShell>
  );
}
