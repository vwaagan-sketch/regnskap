"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionContext, getAuth } from "@/db/context";
import { companyFromForm, updateCompany, validateCompany } from "@/db/company-repo";
import { addCompanyForUser, switchSessionCompany } from "@/db/user-repo";
import { rotateInboxToken, setAllowedSenders } from "@/db/inbox-repo";
import { parseAllowedSenders } from "@/lib/inbound/message";

export interface FirmaState {
  ok: boolean;
  errors: string[];
}

/** Oppdaterer opplysningene for firmaet brukeren er logget inn i (bare administrator). */
export async function saveFirma(_prev: FirmaState, form: FormData): Promise<FirmaState> {
  const { ctx, error } = await actionContext("admin");
  if (!ctx) return { ok: false, errors: [error] };
  const input = companyFromForm(form);
  const errors = validateCompany(input);
  if (errors.length) return { ok: false, errors };
  try {
    await updateCompany(ctx.sql, ctx.company.id, input, ctx.user.email);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/", "layout");
  return { ok: true, errors: [] };
}

/** Oppretter et nytt firma for innlogget bruker og bytter til det. */
export async function createFirma(_prev: FirmaState, form: FormData): Promise<FirmaState> {
  const auth = await getAuth();
  if (!auth) return { ok: false, errors: ["Du er ikke innlogget"] };
  const input = companyFromForm(form);
  const errors = validateCompany(input);
  if (errors.length) return { ok: false, errors };
  try {
    const companyId = await addCompanyForUser(auth.sql, auth.user, input);
    await switchSessionCompany(auth.sql, auth.sessionId, auth.user.id, companyId);
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  revalidatePath("/", "layout");
  redirect("/");
}

/** Bytter hvilket firma brukeren jobber i. */
export async function switchFirma(form: FormData): Promise<void> {
  const auth = await getAuth();
  if (!auth) redirect("/logg-inn");
  await switchSessionCompany(auth.sql, auth.sessionId, auth.user.id, Number(form.get("companyId")));
  revalidatePath("/", "layout");
  redirect("/");
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

export interface InboxState {
  ok: boolean;
  error: string | null;
}

/** Lagrer hvem som får sende bilag til firmaets innboksadresse. */
export async function saveAllowedSenders(_prev: InboxState, form: FormData): Promise<InboxState> {
  const { senders, invalid } = parseAllowedSenders(String(form.get("allowed_senders") ?? ""));
  if (invalid.length) return { ok: false, error: `Ugyldig e-postadresse: ${invalid.join(", ")}` };
  const { ctx, error } = await actionContext("admin");
  if (!ctx) return { ok: false, error };
  try {
    await setAllowedSenders(ctx.sql, ctx.company.id, senders, ctx.user.email);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath("/firma");
  return { ok: true, error: null };
}

/** Lager ny innboksadresse. Den gamle slutter å virke. */
export async function newInboxAddress(): Promise<void> {
  const { ctx } = await actionContext("admin");
  if (!ctx) return;
  await rotateInboxToken(ctx.sql, ctx.company.id, ctx.user.email);
  revalidatePath("/firma");
  revalidatePath("/arkiv");
}
