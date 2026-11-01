import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ neste?: string }> }) {
  const { neste } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-lg shadow-indigo-500/30">R</div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Logg inn</h1>
            <p className="text-sm text-slate-500">Faktura og regnskap</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <LoginForm next={neste ?? "/"} />
        </div>
      </div>
    </main>
  );
}
