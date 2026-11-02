"use server";

import { redirect } from "next/navigation";
import { getSql } from "@/db/client";
import { getAuth, setSessionCookie } from "@/db/context";
import { acceptInvitation, authenticate, createSession, getInvitation, switchSessionCompany } from "@/db/user-repo";
import { validatePassword } from "@/lib/auth/password";

export interface AcceptState {
  error: string | null;
}

/** Godtar en invitasjon som innlogget bruker, eksisterende bruker (med passord) eller ny bruker. */
export async function acceptAction(_prev: AcceptState, form: FormData): Promise<AcceptState> {
  const sql = getSql();
  if (!sql) return { error: "Databasen er ikke koblet til" };
  const token = String(form.get("token") ?? "");
  const inv = await getInvitation(sql, token);
  if (!inv) return { error: "Invitasjonen er ugyldig, brukt eller utløpt" };

  const auth = await getAuth();
  try {
    if (auth && auth.user.email.toLowerCase() === inv.email.toLowerCase()) {
      const { companyId } = await acceptInvitation(sql, token, { userId: auth.user.id });
      await switchSessionCompany(sql, auth.sessionId, auth.user.id, companyId);
    } else if (inv.user_exists) {
      const user = await authenticate(sql, inv.email, String(form.get("password") ?? ""));
      if (!user) {
        await new Promise((r) => setTimeout(r, 800));
        return { error: "Feil passord" };
      }
      const { companyId } = await acceptInvitation(sql, token, { userId: user.id });
      await setSessionCookie(await createSession(sql, user.id, companyId));
    } else {
      const name = String(form.get("name") ?? "").trim();
      const password = String(form.get("password") ?? "");
      if (!name) return { error: "Skriv inn navnet ditt" };
      const pwError = validatePassword(password);
      if (pwError) return { error: pwError };
      if (password !== String(form.get("password2") ?? "")) return { error: "Passordene er ikke like" };
      const { userId, companyId } = await acceptInvitation(sql, token, { name, password });
      await setSessionCookie(await createSession(sql, userId, companyId));
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/");
}
