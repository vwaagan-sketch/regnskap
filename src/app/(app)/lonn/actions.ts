"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/db/context";
import {
  createAMelding, createEmployee, createRun, previewRun, registerPayout, reverseRun, savePayrollSettings, updateEmployee,
  type RunInput,
} from "@/db/payroll-repo";
import { parseKr } from "@/lib/money";
import type { AgaZone, CalculatedPayslip, EmployeeInput, TaxInput } from "@/lib/payroll";

export interface FormState { ok: boolean; errors: string[] }

export async function saveSettingsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { ok: false, errors: [error] };
  const { sql, company, user } = ctx;
  try {
    await savePayrollSettings(sql, company.id, {
      business_unit_org_no: String(form.get("business_unit_org_no") ?? "").replace(/\D/g, ""),
      aga_zone: String(form.get("aga_zone") ?? "") as AgaZone,
      holiday_pay_rate_bp: Number(form.get("holiday_pay_rate_bp")),
    }, user.email);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/lonn");
  return { ok: true, errors: [] };
}

function readEmployee(form: FormData): EmployeeInput | string {
  const t = (k: string) => String(form.get(k) ?? "").trim();
  const num = (k: string) => Number(t(k).replace(",", "."));
  const payType = t("pay_type") === "time" ? "time" : "fast";
  const monthly = t("monthly_salary") ? parseKr(t("monthly_salary")) : null;
  const hourly = t("hourly_rate") ? parseKr(t("hourly_rate")) : null;
  if (t("monthly_salary") && monthly === null) return "Ugyldig månedslønn";
  if (t("hourly_rate") && hourly === null) return "Ugyldig timesats";
  return {
    name: t("name"),
    national_id: t("national_id").replace(/\D/g, ""),
    email: t("email") || null,
    address: t("address"),
    postal_code: t("postal_code"),
    city: t("city"),
    bank_account: t("bank_account").replace(/\D/g, "") || null,
    employment_id: t("employment_id"),
    start_date: t("start_date"),
    end_date: t("end_date") || null,
    occupation_code: t("occupation_code").replace(/\D/g, ""),
    position_pct: num("position_pct"),
    hours_per_week: num("hours_per_week"),
    pay_type: payType,
    monthly_salary_ore: monthly,
    hourly_rate_ore: hourly,
    tax_percent: num("tax_percent"),
  };
}

export async function saveEmployeeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { ok: false, errors: [error] };
  const { sql, company, user } = ctx;
  const input = readEmployee(form);
  if (typeof input === "string") return { ok: false, errors: [input] };
  const id = Number(form.get("id") || 0);
  try {
    if (id) await updateEmployee(sql, company.id, id, input, user.email);
    else await createEmployee(sql, company.id, input, user.email);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/lonn/ansatte");
  revalidatePath("/lonn");
  return { ok: true, errors: [] };
}

export interface PreviewResult {
  error?: string;
  slips?: { employeeId: number; employeeName: string; tax: TaxInput; calc: CalculatedPayslip }[];
}

export async function previewRunAction(input: RunInput): Promise<PreviewResult> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { error };
  const { sql, company } = ctx;
  try {
    return { slips: await previewRun(sql, company.id, input) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createRunAction(input: RunInput): Promise<{ id?: number; error?: string }> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { error };
  const { sql, company, user } = ctx;
  try {
    const r = await createRun(sql, company, input, user.email);
    revalidatePath("/lonn");
    return { id: r.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function payoutAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { ok: false, errors: [error] };
  const { sql, company, user } = ctx;
  const id = Number(form.get("runId"));
  try {
    await registerPayout(sql, company.id, id, String(form.get("date") ?? ""), form.get("transferTax") === "on", user.email);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath(`/lonn/${id}`);
  revalidatePath("/lonn");
  return { ok: true, errors: [] };
}

export async function reverseRunAction(runId: number, date: string): Promise<{ id?: number; error?: string }> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { error };
  const { sql, company, user } = ctx;
  try {
    const r = await reverseRun(sql, company.id, runId, date, user.email);
    revalidatePath("/lonn");
    return { id: r.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function createAMeldingAction(period: string): Promise<{ id?: number; error?: string }> {
  const { ctx, error } = await actionContext("skriv");
  if (!ctx) return { error };
  const { sql, company, user } = ctx;
  try {
    const r = await createAMelding(sql, company, period, user.email);
    revalidatePath("/lonn");
    return { id: r.id };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
