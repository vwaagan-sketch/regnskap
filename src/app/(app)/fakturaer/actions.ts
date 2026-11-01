"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/db/context";
import { getInvoice, issueInvoice, registerPayment, type IssueInvoiceInput } from "@/db/invoice-repo";
import { parseKr } from "@/lib/money";
import { today } from "@/lib/http";

export async function createInvoiceAction(input: IssueInvoiceInput): Promise<{ id?: number; error?: string }> {
  const { sql, company } = await requireContext();
  try {
    const r = await issueInvoice(sql, company, { ...input, kind: "invoice" });
    revalidatePath("/fakturaer");
    return { id: r.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function creditInvoiceAction(invoiceId: number): Promise<{ id?: number; error?: string }> {
  const { sql, company } = await requireContext();
  const inv = await getInvoice(sql, company.id, invoiceId);
  if (!inv || inv.kind !== "invoice") return { error: "Fant ikke fakturaen" };
  if (inv.credited_by) return { error: `Fakturaen er allerede kreditert med kreditnota ${inv.credited_by}` };
  if (Number(inv.paid_ore) > 0) return { error: "Fakturaen har innbetalinger. Lag en manuell korrigering i stedet." };
  const d = today();
  try {
    const r = await issueInvoice(sql, company, {
      kind: "credit_note",
      creditsInvoiceId: invoiceId,
      customerId: (await sql<{ customer_id: number }[]>`SELECT customer_id FROM invoice WHERE id = ${invoiceId}`)[0].customer_id,
      issueDate: d,
      dueDate: d,
      deliveryDate: inv.snapshot.invoice.deliveryDate,
      lines: inv.snapshot.invoice.lines,
    });
    revalidatePath("/fakturaer");
    return { id: r.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export interface PaymentState { error?: string; ok?: boolean }

export async function paymentAction(_prev: PaymentState, form: FormData): Promise<PaymentState> {
  const { sql, company } = await requireContext();
  const id = Number(form.get("invoiceId"));
  const amount = parseKr(String(form.get("amount") ?? ""));
  const date = String(form.get("date") ?? "");
  if (amount === null) return { error: "Ugyldig beløp" };
  try {
    await registerPayment(sql, company.id, id, date, amount);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/fakturaer/${id}`);
  revalidatePath("/fakturaer");
  return { ok: true };
}
