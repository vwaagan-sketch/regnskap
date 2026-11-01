import Link from "next/link";
import { logout } from "./logg-inn/actions";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Regnskap</h1>
        <form action={logout}>
          <button className="text-sm text-gray-600 underline">Logg ut</button>
        </form>
      </div>
      <p className="mt-2 text-gray-600">Fakturering og bokføring etter norske regler.</p>
      <ul className="mt-6 grid gap-3">
        <li>
          <Link href="/kvittering" className="block rounded-lg border p-4 hover:bg-gray-50">
            <span className="font-medium">Ta bilde av regning eller kvittering</span>
            <span className="block text-sm text-gray-600">Tolkes automatisk og blir et bilagsforslag du godkjenner.</span>
          </Link>
        </li>
        <li className="rounded-lg border p-4 text-gray-400">Fakturaer (kommer)</li>
        <li className="rounded-lg border p-4 text-gray-400">Hovedbok og rapporter (kommer)</li>
      </ul>
    </main>
  );
}
