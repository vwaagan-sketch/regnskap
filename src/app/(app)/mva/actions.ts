"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/db/context";
import { settleVat } from "@/db/vat-repo";

export async function settleVatAction(year: number, term: string): Promise<{ error?: string; voucherNo?: number }> {
  const { sql, company } = await requireContext();
  try {
    const r = await settleVat(sql, company.id, year, term, "bruker");
    revalidatePath("/mva");
    return { voucherNo: r.voucherNo };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
