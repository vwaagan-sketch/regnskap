import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type postgres from "postgres";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, createSessionToken, getSecret, verifySessionToken } from "@/lib/auth/session";
import { can, NO_ACCESS_MESSAGE, type Access, type Role } from "@/lib/auth/roles";
import { getSql } from "./client";
import type { CompanyRow } from "./company-repo";
import { loadSession, type UserRow } from "./user-repo";

export interface UserContext {
  sql: postgres.Sql;
  sessionId: string;
  user: UserRow;
  company: CompanyRow | null;
  role: Role | null;
}

export interface AppContext extends UserContext {
  company: CompanyRow;
  role: Role;
}

/** Innlogget bruker for denne forespørselen, eller null. Hentes én gang per forespørsel. */
export const getAuth = cache(async (): Promise<UserContext | null> => {
  const sql = getSql();
  const secret = process.env.SESSION_SECRET;
  if (!sql || !secret) return null;
  const sessionId = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value, secret);
  if (!sessionId) return null;
  const s = await loadSession(sql, sessionId);
  return s ? { sql, ...s } : null;
});

/** Krever innlogget bruker. Firma er valgfritt (f.eks. for å opprette et nytt firma). */
export async function requireUser(): Promise<UserContext> {
  const auth = await getAuth();
  if (!auth) redirect("/logg-inn");
  return auth;
}

/**
 * For sider: krever innlogget bruker med tilgang til et firma og riktig rolle.
 * Alle spørringer skal avgrenses med `company.id` herfra.
 */
export async function requireContext(access: Access = "lese"): Promise<AppContext> {
  const auth = await requireUser();
  if (!auth.company || !auth.role) redirect("/firma/ny");
  if (!can(auth.role, access)) redirect("/?ingen-tilgang=1");
  return auth as AppContext;
}

export type ActionContext = { ctx: AppContext; error: null } | { ctx: null; error: string };

/** For server actions: som requireContext, men returnerer en feilmelding i stedet for å sende videre. */
export async function actionContext(access: Access): Promise<ActionContext> {
  const auth = await getAuth();
  if (!auth) return { ctx: null, error: "Du er ikke innlogget" };
  if (!auth.company || !auth.role) return { ctx: null, error: "Velg et firma først" };
  if (!can(auth.role, access)) return { ctx: null, error: NO_ACCESS_MESSAGE[access] };
  return { ctx: auth as AppContext, error: null };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Variant for API-ruter: kaster ApiError med riktig HTTP-status. */
export async function apiContext(access: Access = "lese"): Promise<AppContext> {
  if (!getSql()) throw new ApiError("Databasen er ikke koblet til. Legg inn DATABASE_URL i miljøvariablene.", 503);
  const auth = await getAuth();
  if (!auth) throw new ApiError("Ikke innlogget", 401);
  if (!auth.company || !auth.role) throw new ApiError("Registrer et firma først", 409);
  if (!can(auth.role, access)) throw new ApiError(NO_ACCESS_MESSAGE[access], 403);
  return auth as AppContext;
}

export function apiErrorStatus(e: unknown): number {
  return e instanceof ApiError ? e.status : 500;
}

/** Setter innloggingskapselen for en ny økt. */
export async function setSessionCookie(sessionId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(sessionId, getSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}
