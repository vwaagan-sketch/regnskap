"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Mail, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Card, Field, inputClass } from "@/components/ui";
import type { InboundEmailItem } from "@/db/inbox-repo";
import { newInboxAddress, saveAllowedSenders } from "./actions";

export default function InboxSettings({
  address,
  allowedSenders,
  emails,
}: {
  address: string | null;
  allowedSenders: string[];
  emails: InboundEmailItem[];
}) {
  const [state, action, pending] = useActionState(saveAllowedSenders, { ok: false, error: null });
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card title="Bilag på e-post">
      <div className="grid gap-5 p-5">
        <p className="text-sm text-slate-600">
          Videresend kvitteringer og regninger til firmaets egen adresse. Vedleggene (PDF, bilder, EHF-XML) havner i arkivet under «Ikke bokført».
          Har e-posten ingen vedlegg, arkiveres selve teksten.
        </p>
        {address ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded-xl bg-slate-100 px-3 py-2 text-sm">{address}</code>
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Kopiert" : "Kopier"}
            </Button>
            <form action={newInboxAddress} onSubmit={(e) => { if (!confirm("Lage ny adresse? Den gamle slutter å virke med en gang.")) e.preventDefault(); }}>
              <Button variant="secondary" title="Lag ny adresse hvis den gamle har kommet på avveie"><RefreshCw className="h-4 w-4" /> Ny adresse</Button>
            </form>
          </div>
        ) : (
          <Alert kind="warning">
            E-postmottak er ikke satt opp ennå. Legg inn <code>INNBOKS_ADRESSE</code> og <code>INNBOKS_WEBHOOK_PASSORD</code> i miljøvariablene (se README).
          </Alert>
        )}
        <form action={action} className="grid gap-3">
          <Field label="Godkjente avsendere" hint="Bare e-post fra disse blir tatt imot. Skriv hele adresser eller et domene som @firma.no, én per linje.">
            <textarea name="allowed_senders" rows={3} defaultValue={allowedSenders.join("\n")} placeholder={"deg@gmail.com\n@firma.no"} className={inputClass} />
          </Field>
          {allowedSenders.length === 0 && <Alert kind="warning">Ingen avsendere er godkjent, så all e-post blir avvist.</Alert>}
          {state.error && <Alert kind="error">{state.error}</Alert>}
          {state.ok && <Alert kind="success"><span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Lagret</span></Alert>}
          <div><Button disabled={pending}>{pending ? "Lagrer …" : "Lagre avsendere"}</Button></div>
        </form>
        {emails.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs font-medium text-slate-600">Sist mottatt</p>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {emails.map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.subject || "(uten emne)"}</p>
                    <p className="truncate text-xs text-slate-500">{m.from_address} · {m.received_at}</p>
                    {m.reason && <p className="text-xs text-rose-600">{m.reason}</p>}
                    {m.skipped.length > 0 && <p className="text-xs text-amber-700">Ikke arkivert: {m.skipped.join("; ")}</p>}
                  </div>
                  {m.status === "mottatt" ? (
                    <Badge color="green">{m.documents} {m.documents === 1 ? "dokument" : "dokumenter"}</Badge>
                  ) : (
                    <Badge color="red">Avvist</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
