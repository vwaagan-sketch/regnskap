import type { ReactNode } from "react";

/** Felles ramme for innlogging, registrering og invitasjoner. */
export function AuthShell({ title, subtitle, children, wide = false, footer }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 sm:p-6">
      <div className={wide ? "w-full max-w-2xl" : "w-full max-w-sm"}>
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-lg shadow-indigo-500/30">R</div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">{children}</div>
        {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
      </div>
    </main>
  );
}

/** Registrering er åpen med mindre ALLOW_SIGNUP=false. */
export function signupOpen(): boolean {
  return process.env.ALLOW_SIGNUP !== "false";
}
