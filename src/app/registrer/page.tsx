import Link from "next/link";
import { AuthShell, signupOpen } from "@/components/auth-shell";
import { Alert, Field, inputClass } from "@/components/ui";
import FirmaForm from "@/app/(app)/firma/firma-form";
import { register } from "./actions";

export const dynamic = "force-dynamic";

export default function RegistrerPage() {
  const footer = <>Har du allerede konto? <Link href="/logg-inn" className="font-medium text-indigo-600 hover:underline">Logg inn</Link></>;
  if (!signupOpen()) {
    return (
      <AuthShell title="Registrering er stengt" footer={footer}>
        <Alert>Nye firma kan ikke registrere seg selv akkurat nå. Be en administrator om en invitasjon.</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      wide
      title="Kom i gang"
      subtitle="Registrer firmaet ditt. Du blir administrator og kan invitere flere brukere etterpå."
      footer={footer}
    >
      <FirmaForm
        bare
        company={null}
        action={register}
        submitLabel="Opprett konto og firma"
        bottom={
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 rounded accent-indigo-600" />
            Jeg bekrefter at jeg har rett til å føre regnskap for dette firmaet.
          </label>
        }
      >
        <h2 className="text-sm font-semibold text-slate-800 sm:col-span-2">Om deg</h2>
        <Field label="Fullt navn" className="sm:col-span-2">
          <input name="user_name" autoComplete="name" required className={inputClass} />
        </Field>
        <Field label="E-post" className="sm:col-span-2">
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="Passord" hint="Minst 10 tegn">
          <input name="password" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
        </Field>
        <Field label="Gjenta passord">
          <input name="password2" type="password" autoComplete="new-password" minLength={10} required className={inputClass} />
        </Field>
        <h2 className="mt-2 border-t border-slate-100 pt-5 text-sm font-semibold text-slate-800 sm:col-span-2">Om firmaet</h2>
      </FirmaForm>
    </AuthShell>
  );
}
