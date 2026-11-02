"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, Mail, Pencil, UserPlus, X } from "lucide-react";
import { Alert, Badge, Button, Card, Field, inputClass } from "@/components/ui";
import type { InvitationRow, MemberRow } from "@/db/user-repo";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { inviteAction, revokeInvitationAction, updateMemberAction } from "./actions";

const ROLE_COLOR: Record<Role, "indigo" | "green" | "gray"> = { admin: "indigo", regnskap: "green", lese: "gray" };

function RoleSelect({ defaultValue }: { defaultValue: Role }) {
  return (
    <select name="role" defaultValue={defaultValue} className={inputClass}>
      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
    </select>
  );
}

function InviteForm() {
  const [state, action, pending] = useActionState(inviteAction, { error: null, link: null, email: null });
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.link) ref.current?.reset();
    setCopied(false);
  }, [state]);
  return (
    <Card title="Inviter bruker" className="h-fit">
      <form ref={ref} action={action} className="grid gap-4 p-5">
        <Field label="E-post">
          <input name="email" type="email" placeholder="navn@firma.no" className={inputClass} required />
        </Field>
        <Field label="Rolle">
          <RoleSelect defaultValue="regnskap" />
        </Field>
        <ul className="grid gap-1 text-xs text-slate-500">
          {ROLES.map((r) => <li key={r}><span className="font-medium text-slate-700">{ROLE_LABELS[r]}:</span> {ROLE_DESCRIPTIONS[r]}</li>)}
        </ul>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.link && (
          <Alert kind="success">
            <p className="mb-2">Send denne lenken til {state.email}. Den virker i 14 dager og kan bare brukes én gang.</p>
            <div className="flex gap-2">
              <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className={`${inputClass} font-mono text-xs`} />
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true))}
                aria-label="Kopier lenken"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </Alert>
        )}
        <Button disabled={pending}><UserPlus className="h-4 w-4" /> {pending ? "Lager invitasjon …" : "Lag invitasjonslenke"}</Button>
      </form>
    </Card>
  );
}

function MemberItem({ m, isSelf }: { m: MemberRow; isSelf: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateMemberAction, { error: null, ok: false });
  useEffect(() => { if (state.ok) setEditing(false); }, [state]);

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
          {m.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {m.name} {isSelf && <span className="font-normal text-slate-400">(deg)</span>}
          </p>
          <p className="truncate text-xs text-slate-500">{m.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {m.active ? <Badge color={ROLE_COLOR[m.role]}>{ROLE_LABELS[m.role]}</Badge> : <Badge color="red">Deaktivert</Badge>}
          <span className="hidden text-xs text-slate-400 sm:inline">
            {m.last_login_at ? `Sist innlogget ${m.last_login_at}` : "Aldri innlogget"}
          </span>
          {!isSelf && !editing && (
            <Button variant="ghost" className="px-2" aria-label={`Endre ${m.name}`} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <form action={action} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <input type="hidden" name="userId" value={m.user_id} />
          <RoleSelect defaultValue={m.role} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4 accent-indigo-600" /> Har tilgang
          </label>
          <div className="flex gap-1">
            <Button disabled={pending} aria-label="Lagre" className="px-3"><Check className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" aria-label="Avbryt" className="px-3" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
          </div>
          {state.error && <div className="sm:col-span-3"><Alert kind="error">{state.error}</Alert></div>}
        </form>
      )}
    </li>
  );
}

export default function UsersView({ members, invitations, currentUserId }: {
  members: MemberRow[];
  invitations: InvitationRow[];
  currentUserId: number;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid h-fit gap-6">
        <Card title={`Brukere (${members.filter((m) => m.active).length})`}>
          <ul className="divide-y divide-slate-100">
            {members.map((m) => <MemberItem key={m.user_id} m={m} isSelf={m.user_id === currentUserId} />)}
          </ul>
        </Card>
        {invitations.length > 0 && (
          <Card title="Ventende invitasjoner">
            <ul className="divide-y divide-slate-100">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.email}</p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABELS[i.role]} · sendt {i.created_at} · {i.expired ? "utløpt" : `gyldig til ${i.expires_at}`}
                    </p>
                  </div>
                  {i.expired && <Badge color="amber">Utløpt</Badge>}
                  <form action={revokeInvitationAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button variant="danger" className="px-3 py-1.5 text-xs">Trekk tilbake</Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <InviteForm />
    </div>
  );
}
