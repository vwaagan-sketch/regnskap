import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ neste?: string }> }) {
  const { neste } = await searchParams;
  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="text-2xl font-semibold">Logg inn</h1>
      <LoginForm next={neste ?? "/"} />
    </main>
  );
}
