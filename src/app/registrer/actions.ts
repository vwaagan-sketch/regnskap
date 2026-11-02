"use server";

import { redirect } from "next/navigation";
import { signupOpen } from "@/components/auth-shell";
import { getSql } from "@/db/client";
import { setSessionCookie } from "@/db/context";
import { companyFromForm, validateCompany } from "@/db/company-repo";
import { createSession, registerCompanyWithAdmin, validateNewUser } from "@/db/user-repo";
import type { FirmaState } from "@/app/(app)/firma/actions";

/** Selvregistrering: oppretter bruker og firma, og logger inn. */
export async function register(_prev: FirmaState, form: FormData): Promise<FirmaState> {
  if (!signupOpen()) return { ok: false, errors: ["Registrering av nye firma er stengt"] };
  const sql = getSql();
  if (!sql) return { ok: false, errors: ["Databasen er ikke koblet til"] };
  const user = {
    name: String(form.get("user_name") ?? "").trim(),
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  };
  const company = companyFromForm(form);
  const errors = [...validateNewUser(user), ...validateCompany(company)];
  if (user.password !== String(form.get("password2") ?? "")) errors.push("Passordene er ikke like");
  if (form.get("terms") !== "on") errors.push("Du må bekrefte at du har rett til å registrere firmaet");
  if (errors.length) return { ok: false, errors };
  let ids;
  try {
    ids = await registerCompanyWithAdmin(sql, user, company);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  await setSessionCookie(await createSession(sql, ids.userId, ids.companyId));
  redirect("/");
}
