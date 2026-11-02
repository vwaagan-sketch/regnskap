"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/db/context";
import { settleVat } from "@/db/vat-repo";

export async function settleVatAction(year: number, term: string): Promise<{ error?: string; voucherNo?: number }> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { error };
  const { sql, company, user } = ctx;
  try {
    const r = await settleVat(sql, company.id, year, term, user.email);
    revalidatePath("/mva");
    return { voucherNo: r.voucherNo };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
