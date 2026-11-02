"use server";

import { revalidatePath } from "next/cache";
import { createAccount, updateAccount, validateAccount, type AccountInput } from "@/db/account-repo";
import { actionContext } from "@/db/context";
import type { VatCategory } from "@/lib/vat";

export interface FormResult { ok: boolean; errors: string[] }

function vat(form: FormData): VatCategory | null {
  const v = String(form.get("vat_category") ?? "");
  return (["high", "medium", "low", "zero", "exempt"].includes(v) ? v : null) as VatCategory | null;
}

export async function createAccountAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { ok: false, errors: [error] };
  const { sql, company, user } = ctx;
  const input: AccountInput = {
    number: String(form.get("number") ?? "").trim(),
    name: String(form.get("name") ?? "").trim(),
    vat_category: vat(form),
  };
  const errors = validateAccount(input);
  if (errors.length) return { ok: false, errors };
  try {
    await createAccount(sql, company.id, input, user.email);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/kontoplan");
  return { ok: true, errors: [] };
}

export async function updateAccountAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { ok: false, errors: [error] };
  const { sql, company, user } = ctx;
  const number = String(form.get("number") ?? "");
  const input: AccountInput = { number, name: String(form.get("name") ?? "").trim(), vat_category: vat(form) };
  const errors = validateAccount(input);
  if (errors.length) return { ok: false, errors };
  try {
    await updateAccount(sql, company.id, number, { name: input.name, vat_category: input.vat_category, active: form.get("active") === "on" }, user.email);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/kontoplan");
  return { ok: true, errors: [] };
}
