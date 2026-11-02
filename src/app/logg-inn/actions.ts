"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSql } from "@/db/client";
import { getAuth, setSessionCookie } from "@/db/context";
import { authenticate, bootstrapFirstUser, createSession, deleteSession } from "@/db/user-repo";
import { SESSION_COOKIE, safeNext } from "@/lib/auth/session";

export interface LoginState {
  error: string | null;
  user: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const user = String(form.get("bruker") ?? "").trim();
  const password = String(form.get("passord") ?? "");
  const next = String(form.get("neste") ?? "/");
  const sql = getSql();
  if (!sql) return { error: "Databasen er ikke koblet til. Legg inn DATABASE_URL i miljøvariablene.", user };
  const found = (await authenticate(sql, user, password)) ?? (await bootstrapFirstUser(sql, user, password));
  if (!found) {
    await new Promise((r) => setTimeout(r, 800)); // bremser gjetting
    return { error: "Feil e-post eller passord", user };
  }
  await setSessionCookie(await createSession(sql, found.id));
  redirect(safeNext(next));
}

export async function logout() {
  const auth = await getAuth();
  if (auth) await deleteSession(auth.sql, auth.sessionId);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/logg-inn");
}
