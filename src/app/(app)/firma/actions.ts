"use server";

import { revalidatePath } from "next/cache";
import { requireSql } from "@/db/client";
import { saveCompany, validateCompany, type CompanyInput } from "@/db/company-repo";

export interface FirmaState {
  ok: boolean;
  errors: string[];
}

export async function saveFirma(_prev: FirmaState, form: FormData): Promise<FirmaState> {
  const digits = (k: string) => String(form.get(k) ?? "").replace(/\D/g, "");
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const input: CompanyInput = {
    name: text("name"),
    org_no: digits("org_no"),
    address: text("address"),
    postal_code: text("postal_code"),
    city: text("city"),
    bank_account: digits("bank_account"),
    vat_registered: form.get("vat_registered") === "on",
    in_business_register: form.get("in_business_register") === "on",
  };
  const errors = validateCompany(input);
  if (errors.length) return { ok: false, errors };
  try {
    await saveCompany(requireSql(), input);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/", "layout");
  return { ok: true, errors: [] };
}

export interface BrregResult {
  name: string;
  address: string;
  postal_code: string;
  city: string;
  vat_registered: boolean;
  in_business_register: boolean;
}

/** Slår opp organisasjonsnummer i Enhetsregisteret (Brønnøysundregistrene). */
export async function lookupOrgNo(orgNo: string): Promise<BrregResult | { error: string }> {
  const n = orgNo.replace(/\D/g, "");
  if (!/^\d{9}$/.test(n)) return { error: "Organisasjonsnummeret må ha 9 siffer" };
  try {
    const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${n}`, { cache: "no-store" });
    if (!res.ok) return { error: "Fant ikke organisasjonsnummeret i Enhetsregisteret" };
    const e = await res.json();
    const a = e.forretningsadresse ?? e.postadresse ?? {};
    return {
      name: e.navn ?? "",
      address: (a.adresse ?? []).join(", "),
      postal_code: a.postnummer ?? "",
      city: a.poststed ?? "",
      vat_registered: Boolean(e.registrertIMvaregisteret),
      in_business_register: Boolean(e.registrertIForetaksregisteret),
    };
  } catch {
    return { error: "Kunne ikke nå Brønnøysundregistrene akkurat nå" };
  }
}
