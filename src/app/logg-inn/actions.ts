"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  checkCredentials,
  createSessionToken,
  getSecret,
} from "@/lib/auth/session";

export interface LoginState {
  error: string | null;
  user: string;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const user = String(form.get("bruker") ?? "");
  const password = String(form.get("passord") ?? "");
  const next = String(form.get("neste") ?? "/");
  if (!checkCredentials(user, password)) {
    await new Promise((r) => setTimeout(r, 800)); // bremser gjetting
    return { error: "Feil brukernavn eller passord", user };
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(user, getSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/logg-inn");
}
