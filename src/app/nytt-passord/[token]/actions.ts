"use server";

import { redirect } from "next/navigation";
import { getSql } from "@/db/client";
import { setSessionCookie } from "@/db/context";
import { createSession, resetPassword } from "@/db/user-repo";

export interface ResetState {
  error: string | null;
}

export async function resetAction(_prev: ResetState, form: FormData): Promise<ResetState> {
  const sql = getSql();
  if (!sql) return { error: "Databasen er ikke koblet til" };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("password2") ?? "")) return { error: "Passordene er ikke like" };
  let userId: number;
  try {
    userId = await resetPassword(sql, String(form.get("token") ?? ""), password);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await setSessionCookie(await createSession(sql, userId));
  redirect("/");
}
