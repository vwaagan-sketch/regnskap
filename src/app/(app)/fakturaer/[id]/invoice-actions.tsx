"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, FileCode2, Printer, Undo2 } from "lucide-react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import { oreToInput } from "@/lib/money";
import { creditInvoiceAction, paymentAction, type PaymentState } from "../actions";

const todayIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());

export default function InvoiceActions({ id, isCredit, canCredit, openOre, ehf }: { id: number; isCredit: boolean; canCredit: boolean; openOre: number; ehf: boolean }) {
  const router = useRouter();
  const [payState, payAction, paying] = useActionState(paymentAction, {} as PaymentState);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [crediting, startCredit] = useTransition();

  function credit() {
    if (!confirm("Lage kreditnota for hele fakturaen?")) return;
    startCredit(async () => {
      const r = await creditInvoiceAction(id);
      if (r.error) setCreditError(r.error);
      else router.push(`/fakturaer/${r.id}`);
    });
  }

  return (
    <>
      <Card className="grid gap-2 p-4">
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Skriv ut / lagre PDF</Button>
        {ehf ? (
          <a href={`/api/fakturaer/${id}/ehf`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">
            <FileCode2 className="h-4 w-4" /> Last ned EHF
          </a>
        ) : (
          <p className="text-xs text-slate-500">EHF krever at kunden har organisasjonsnummer.</p>
        )}
        {canCredit && <Button variant="danger" onClick={credit} disabled={crediting}><Undo2 className="h-4 w-4" /> Krediter</Button>}
        {creditError && <Alert kind="error">{creditError}</Alert>}
      </Card>
      {!isCredit && openOre > 0 && (
        <Card title="Registrer innbetaling">
          <form action={payAction} className="grid gap-3 p-4">
            <input type="hidden" name="invoiceId" value={id} />
            <Field label="Dato"><input type="date" name="date" defaultValue={todayIso()} className={inputClass} /></Field>
            <Field label="Beløp (kr)"><input name="amount" inputMode="decimal" defaultValue={oreToInput(openOre)} className={inputClass} /></Field>
            {payState.error && <Alert kind="error">{payState.error}</Alert>}
            {payState.ok && <Alert kind="success">Innbetalingen er bokført</Alert>}
            <Button variant="secondary" disabled={paying}><Banknote className="h-4 w-4" /> Bokfør innbetaling</Button>
          </form>
        </Card>
      )}
    </>
  );
}
