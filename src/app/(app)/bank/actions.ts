"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/db/context";
import { approveSafeSuggestions, reconcileTransaction, unmatchTransaction, type MatchAction } from "@/db/bank-repo";

export interface BankActionResult { error?: string; message?: string }

function refresh() {
  revalidatePath("/bank");
  revalidatePath("/fakturaer");
  revalidatePath("/bilag");
  revalidatePath("/");
}

export async function reconcileAction(transactionId: string, action: MatchAction): Promise<BankActionResult> {
  const { sql, company } = await requireContext();
  try {
    const r = await reconcileTransaction(sql, company, transactionId, action);
    refresh();
    return { message: `Avstemt mot bilag ${r.voucherNo}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function approveSafeAction(): Promise<BankActionResult> {
  const { sql, company } = await requireContext();
  try {
    const n = await approveSafeSuggestions(sql, company);
    refresh();
    return { message: n === 0 ? "Ingen sikre forslag å godkjenne" : `${n} ${n === 1 ? "transaksjon" : "transaksjoner"} avstemt` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function unmatchAction(transactionId: string): Promise<BankActionResult> {
  const { sql, company } = await requireContext();
  try {
    await unmatchTransaction(sql, company.id, transactionId);
    refresh();
    return { message: "Koblingen er fjernet" };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
