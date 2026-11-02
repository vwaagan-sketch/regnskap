"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/db/context";
import { saveProduct, validateProduct, type ProductInput } from "@/db/product-repo";
import { parseKr } from "@/lib/money";
import type { VatCategory } from "@/lib/vat";

export interface FormResult { ok: boolean; errors: string[] }

export async function saveProductAction(_prev: FormResult, form: FormData): Promise<FormResult> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { ok: false, errors: [error] };
  const { sql, company } = ctx;
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const price = parseKr(t("price") || "0");
  const input: ProductInput = {
    product_no: t("product_no"),
    name: t("name"),
    description: t("description") || null,
    unit: t("unit") || "stk",
    price_ore: price ?? NaN,
    vat_category: t("vat_category") as VatCategory,
    revenue_account: t("revenue_account"),
  };
  const errors = validateProduct(input);
  if (price === null) errors.unshift("Ugyldig pris");
  if (errors.length) return { ok: false, errors };
  const id = Number(t("id")) || undefined;
  try {
    await saveProduct(sql, company.id, input, id, id ? form.get("active") === "on" : true);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/varer");
  return { ok: true, errors: [] };
}
