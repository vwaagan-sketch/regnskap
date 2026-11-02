"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, CloudUpload, Link2Off, Loader2, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Money, cx, formatDate, inputClass } from "@/components/ui";
import type { MatchAction } from "@/db/bank-repo";
import type { Suggestion } from "@/lib/bank/match";
import { approveSafeAction, reconcileAction, unmatchAction, type BankActionResult } from "./actions";

export function StatementUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setMessage(null);
    const lines: string[] = [];
    let failed = false;
    for (const f of list) {
      const body = new FormData();
      body.append("fil", f);
      try {
        const res = await fetch("/api/bank/import", { method: "POST", body });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        lines.push(
          `${f.name}: ${json.imported} ${json.imported === 1 ? "ny transaksjon" : "nye transaksjoner"}` +
            (json.duplicates ? `, ${json.duplicates} fantes fra før` : ""),
        );
      } catch (e) {
        failed = true;
        lines.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    setMessage({ kind: failed ? "error" : "success", text: lines.join(" · ") });
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-white px-6 py-8 text-center transition",
          dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40",
        )}
      >
        {busy ? <Loader2 className="h-7 w-7 animate-spin text-indigo-500" /> : <CloudUpload className="h-7 w-7 text-indigo-500" />}
        <p className="font-medium">{busy ? "Leser kontoutskrift …" : "Slipp kontoutskrift her, eller klikk for å velge"}</p>
        <p className="text-xs text-slate-500">CAMT.053 (XML) eller CSV fra nettbanken. Samme transaksjon importeres bare én gang.</p>
        <input ref={input} type="file" multiple accept=".xml,.csv,.txt,application/xml,text/xml,text/csv" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </div>
  );
}

function useBankAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BankActionResult | null>(null);
  const run = (fn: () => Promise<BankActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (!r.error) router.refresh();
    });
  return { pending, result, run };
}

export function ApproveAllButton({ count }: { count: number }) {
  const { pending, result, run } = useBankAction();
  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={() => run(approveSafeAction)} disabled={pending || count === 0}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
        Godkjenn sikre forslag ({count})
      </Button>
      {result?.error && <Alert kind="error">{result.error}</Alert>}
    </div>
  );
}

export function UnmatchButton({ transactionId }: { transactionId: string }) {
  const { pending, result, run } = useBankAction();
  return (
    <>
      <button
        onClick={() => run(() => unmatchAction(transactionId))}
        disabled={pending}
        title="Fjern kobling"
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
      >
        <Link2Off className="h-4 w-4" />
      </button>
      {result?.error && <span className="text-xs text-rose-600">{result.error}</span>}
    </>
  );
}

const CONF_COLOR = { sikker: "green", sannsynlig: "indigo", mulig: "amber" } as const;

export interface TxView {
  id: string;
  date: string;
  amountOre: number;
  description: string;
  counterparty: string | null;
  reference: string | null;
}

type Mode = "invoice" | "entry" | "new";

export function TransactionRow({
  tx, suggestion, invoices, entries, accounts, vatRegistered,
}: {
  tx: TxView;
  suggestion: Suggestion | null;
  invoices: { id: number; number: number; customerName: string; openOre: number }[];
  entries: { entryId: string; voucherNo: number; date: string; amountOre: number; description: string }[];
  accounts: { number: string; name: string }[];
  vatRegistered: boolean;
}) {
  const { pending, result, run } = useBankAction();
  const incoming = tx.amountOre > 0;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(incoming && invoices.length ? "invoice" : entries.length ? "entry" : "new");
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? 0);
  const [entryId, setEntryId] = useState(entries[0]?.entryId ?? "");
  const [account, setAccount] = useState("");
  const [vat, setVat] = useState<"" | "high" | "medium" | "low">("");
  const [text, setText] = useState(tx.description);

  const suggestionAction: MatchAction | null = suggestion
    ? suggestion.kind === "invoice" ? { kind: "invoice", invoiceId: suggestion.invoiceId } : { kind: "entry", entryId: suggestion.entryId }
    : null;

  function submit() {
    const action: MatchAction =
      mode === "invoice" ? { kind: "invoice", invoiceId }
        : mode === "entry" ? { kind: "entry", entryId }
          : { kind: "new", account, vatCategory: vat || null, description: text };
    run(() => reconcileAction(tx.id, action));
  }

  const modes: [Mode, string, boolean][] = [
    ["invoice", "Kundefaktura", incoming && invoices.length > 0],
    ["entry", "Bokført bilag", entries.length > 0],
    ["new", "Bokfør nå", true],
  ];

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="w-20 shrink-0 text-xs tabular-nums text-slate-500">{formatDate(tx.date)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-900">{tx.description}</span>
          <span className="block truncate text-xs text-slate-500">
            {[tx.counterparty, tx.reference && `KID ${tx.reference}`].filter(Boolean).join(" · ") || (incoming ? "Innbetaling" : "Utbetaling")}
          </span>
        </span>
        <Money ore={tx.amountOre} className={cx("shrink-0 text-sm font-semibold", incoming && "text-emerald-700")} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 sm:pl-24">
        {suggestion ? (
          <>
            <Badge color={CONF_COLOR[suggestion.confidence]}><Sparkles className="mr-1 h-3 w-3" />{suggestion.confidence}</Badge>
            <span className="text-xs text-slate-600">
              {suggestion.kind === "invoice" ? `Faktura ${suggestion.invoiceNumber}` : `Bilag ${suggestion.voucherNo}`}: {suggestion.reason}
            </span>
            <Button variant="secondary" className="px-3 py-1 text-xs" disabled={pending} onClick={() => suggestionAction && run(() => reconcileAction(tx.id, suggestionAction))}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Godkjenn
            </Button>
          </>
        ) : (
          <span className="text-xs text-slate-400">Ingen forslag</span>
        )}
        <button onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-indigo-600 hover:underline">
          {open ? "Skjul" : suggestion ? "Velg selv" : "Avstem"}
        </button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:ml-24">
          <div className="flex flex-wrap gap-1">
            {modes.filter(([, , ok]) => ok).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={cx("rounded-lg px-3 py-1 text-xs font-medium", mode === m ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white")}>
                {label}
              </button>
            ))}
          </div>
          {mode === "invoice" && (
            <select className={inputClass} value={invoiceId} onChange={(e) => setInvoiceId(Number(e.target.value))}>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>Faktura {i.number} · {i.customerName} · åpent {(i.openOre / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2 })}</option>
              ))}
            </select>
          )}
          {mode === "entry" && (
            <select className={inputClass} value={entryId} onChange={(e) => setEntryId(e.target.value)}>
              {entries.map((e) => (
                <option key={e.entryId} value={e.entryId}>
                  Bilag {e.voucherNo} · {formatDate(e.date)} · {e.description} · {(e.amountOre / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          )}
          {mode === "new" && (
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <select className={inputClass} value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">{incoming ? "Velg konto for innbetalingen …" : "Velg kostnads- eller gjeldskonto …"}</option>
                {accounts.filter((a) => a.number !== "1920").map((a) => (
                  <option key={a.number} value={a.number}>{a.number} {a.name}</option>
                ))}
              </select>
              <select className={inputClass} value={vat} onChange={(e) => setVat(e.target.value as typeof vat)} disabled={!vatRegistered}>
                <option value="">Uten MVA</option>
                <option value="high">25 % MVA</option>
                <option value="medium">15 % MVA</option>
                <option value="low">12 % MVA</option>
              </select>
              <input className={cx(inputClass, "sm:col-span-2")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Beskrivelse" />
              <p className="text-xs text-slate-500 sm:col-span-2">Kontoutskriften legges ved bilaget som dokumentasjon. Har du kvittering eller faktura, last den opp i Arkiv og bokfør derfra, så kobler du bilaget her etterpå.</p>
            </div>
          )}
          <div>
            <Button onClick={submit} disabled={pending || (mode === "new" && !account) || (mode === "entry" && !entryId)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {mode === "new" ? "Bokfør og avstem" : mode === "invoice" ? "Bokfør innbetaling" : "Koble til bilag"}
            </Button>
          </div>
        </div>
      )}
      {result?.error && <div className="mt-2 sm:pl-24"><Alert kind="error">{result.error}</Alert></div>}
    </li>
  );
}
