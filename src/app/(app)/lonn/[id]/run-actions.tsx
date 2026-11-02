"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Printer, Undo2 } from "lucide-react";
import { Alert, Button, Card, Field, inputClass } from "@/components/ui";
import { formatKr } from "@/lib/money";
import { payoutAction, reverseRunAction } from "../actions";

const todayIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());

export default function RunActions({ id, payDate, netOre, taxOre, canPay, canReverse }: {
  id: number; payDate: string; netOre: number; taxOre: number; canPay: boolean; canReverse: boolean;
}) {
  const router = useRouter();
  const [state, action, paying] = useActionState(payoutAction, { ok: false, errors: [] });
  const [revError, setRevError] = useState<string | null>(null);
  const [reversing, startReverse] = useTransition();

  function reverse() {
    if (!confirm("Reversere hele lønnskjøringen? Det lages en motpostering, og lønnen nulles ut i a-meldingen for måneden.")) return;
    startReverse(async () => {
      const r = await reverseRunAction(id, todayIso());
      if (r.error) setRevError(r.error);
      else router.push(`/lonn/${r.id}`);
    });
  }

  return (
    <>
      <Card className="grid gap-2 p-4">
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Skriv ut lønnsslipper</Button>
        {canReverse && <Button variant="danger" onClick={reverse} disabled={reversing}><Undo2 className="h-4 w-4" /> Reverser</Button>}
        {revError && <Alert kind="error">{revError}</Alert>}
      </Card>
      {canPay && (
        <Card title="Registrer utbetaling">
          <form action={action} className="grid gap-3 p-4">
            <input type="hidden" name="runId" value={id} />
            <Field label="Dato"><input type="date" name="date" defaultValue={payDate} className={inputClass} /></Field>
            <p className="text-sm text-slate-600">Netto lønn kr {formatKr(netOre)} fra bankkonto 1920.</p>
            {taxOre > 0 && (
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" name="transferTax" defaultChecked className="mt-0.5" />
                <span>Overfør forskuddstrekket (kr {formatKr(taxOre)}) til skattetrekkskontoen (1950)</span>
              </label>
            )}
            {state.errors.length > 0 && <Alert kind="error">{state.errors.join(". ")}</Alert>}
            <Button variant="secondary" disabled={paying}><Banknote className="h-4 w-4" /> Bokfør utbetaling</Button>
          </form>
        </Card>
      )}
      {state.ok && <Alert kind="success">Utbetalingen er bokført</Alert>}
    </>
  );
}
