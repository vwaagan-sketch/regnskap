"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/db/context";
import { createCustomer, validateCustomer, type CustomerInput } from "@/db/invoice-repo";
import { lookupOrgNo } from "../firma/actions";

export interface KundeState { ok: boolean; errors: string[] }

export async function addCustomer(_prev: KundeState, form: FormData): Promise<KundeState> {
  const { sql, company } = await requireContext();
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const input: CustomerInput = {
    name: t("name"),
    org_no: t("org_no").replace(/\D/g, "") || null,
    email: t("email") || null,
    address: t("address"),
    postal_code: t("postal_code"),
    city: t("city"),
  };
  const errors = validateCustomer(input);
  if (errors.length) return { ok: false, errors };
  await createCustomer(sql, company.id, input);
  revalidatePath("/kunder");
  return { ok: true, errors: [] };
}

export async function lookupCustomer(orgNo: string) {
  return lookupOrgNo(orgNo);
}
