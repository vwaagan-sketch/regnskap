import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { checkCredentials, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { hashPassword, normalizeEmail, validateEmail, validatePassword, verifyPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/auth/roles";
import { createCompany, type CompanyInput, type CompanyRow } from "./company-repo";

type Db = postgres.Sql | postgres.TransactionSql;

export interface UserRow {
  id: number;
  email: string;
  name: string;
}

export interface SessionInfo {
  sessionId: string;
  user: UserRow;
  company: CompanyRow | null;
  role: Role | null;
}

export const INVITATION_DAYS = 14;

/** Brukes når e-posten ikke finnes, slik at svartiden ikke avslører om kontoen finnes. */
let dummyHash: Promise<string> | null = null;

export class UserError extends Error {}

export async function findUserByEmail(sql: Db, email: string) {
  const [row] = await sql<(UserRow & { password_hash: string })[]>`
    SELECT id, email, name, password_hash FROM app_user WHERE lower(email) = ${normalizeEmail(email)}`;
  return row ?? null;
}

export interface NewUser {
  email: string;
  name: string;
  password: string;
}

export function validateNewUser(u: NewUser): string[] {
  const errors: string[] = [];
  if (!u.name.trim()) errors.push("Navn mangler");
  const e = validateEmail(normalizeEmail(u.email));
  if (e) errors.push(e);
  const p = validatePassword(u.password);
  if (p) errors.push(p);
  return errors;
}

export async function createUser(tx: postgres.TransactionSql, u: NewUser): Promise<number> {
  const email = normalizeEmail(u.email);
  if (await findUserByEmail(tx, email)) {
    throw new UserError("E-postadressen er allerede registrert. Logg inn i stedet.");
  }
  const [{ id }] = await tx<{ id: number }[]>`
    INSERT INTO app_user (email, name, password_hash)
    VALUES (${email}, ${u.name.trim()}, ${await hashPassword(u.password)}) RETURNING id`;
  return id;
}

/** Sjekker e-post og passord. Returnerer brukeren eller null. */
export async function authenticate(sql: postgres.Sql, email: string, password: string): Promise<UserRow | null> {
  const user = await findUserByEmail(sql, email);
  if (!user) {
    dummyHash ??= hashPassword("ingen-bruker-finnes");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  if (!(await verifyPassword(password, user.password_hash))) return null;
  return { id: user.id, email: user.email, name: user.name };
}

/**
 * Overgang fra innlogging med APP_USER/APP_PASSWORD: Så lenge ingen brukere finnes,
 * opprettes den første brukeren fra miljøvariablene og blir administrator for alle firma.
 */
export async function bootstrapFirstUser(sql: postgres.Sql, login: string, password: string): Promise<UserRow | null> {
  if (!checkCredentials(login, password)) return null;
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(42, 1)`;
    const [{ n }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM app_user`;
    if (n > 0) return null;
    const email = normalizeEmail(login);
    const [{ id }] = await tx<{ id: number }[]>`
      INSERT INTO app_user (email, name, password_hash)
      VALUES (${email}, ${login.trim()}, ${await hashPassword(password)}) RETURNING id`;
    await tx`INSERT INTO membership (user_id, company_id, role) SELECT ${id}, id, 'admin' FROM company`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             SELECT id, ${email}, 'bootstrap', 'app_user', ${String(id)}, NULL FROM company`;
    return { id, email, name: login.trim() };
  }) as Promise<UserRow | null>;
}

export async function createSession(sql: postgres.Sql, userId: number, companyId: number | null = null): Promise<string> {
  await sql`DELETE FROM user_session WHERE user_id = ${userId} AND expires_at < now()`;
  await sql`UPDATE app_user SET last_login_at = now() WHERE id = ${userId}`;
  const [{ id }] = await sql<{ id: string }[]>`
    INSERT INTO user_session (user_id, company_id, expires_at)
    VALUES (${userId}, ${companyId}, now() + make_interval(secs => ${SESSION_TTL_SECONDS}))
    RETURNING id::text`;
  return id;
}

export async function deleteSession(sql: postgres.Sql, sessionId: string): Promise<void> {
  if (!isUuid(sessionId)) return;
  await sql`DELETE FROM user_session WHERE id = ${sessionId}`;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
}

/**
 * Henter innlogget bruker og aktivt firma. Firmaet velges bare blant firma der brukeren
 * har aktiv tilgang; har brukeren mistet tilgangen, byttes det til et annet firma (eller ingen).
 */
export async function loadSession(sql: postgres.Sql, sessionId: string): Promise<SessionInfo | null> {
  if (!isUuid(sessionId)) return null;
  const [s] = await sql<{ user_id: number; company_id: number | null; email: string; name: string }[]>`
    SELECT s.user_id, s.company_id, u.email, u.name
    FROM user_session s JOIN app_user u ON u.id = s.user_id
    WHERE s.id = ${sessionId} AND s.expires_at > now()`;
  if (!s) return null;
  const memberships = await sql<(CompanyRow & { role: Role })[]>`
    SELECT c.*, m.role FROM membership m JOIN company c ON c.id = m.company_id
    WHERE m.user_id = ${s.user_id} AND m.active
    ORDER BY (c.id = ${s.company_id ?? 0}) DESC, c.name`;
  const chosen = memberships[0] ?? null;
  if ((chosen?.id ?? null) !== s.company_id) {
    await sql`UPDATE user_session SET company_id = ${chosen?.id ?? null} WHERE id = ${sessionId}`;
  }
  const user = { id: s.user_id, email: s.email, name: s.name };
  if (!chosen) return { sessionId, user, company: null, role: null };
  const { role, ...company } = chosen;
  return { sessionId, user, company, role };
}

/** Bytter aktivt firma for økten. Krever aktiv tilgang til firmaet. */
export async function switchSessionCompany(sql: postgres.Sql, sessionId: string, userId: number, companyId: number): Promise<boolean> {
  const rows = await sql`
    UPDATE user_session s SET company_id = ${companyId}
    WHERE s.id = ${sessionId} AND s.user_id = ${userId}
      AND EXISTS (SELECT 1 FROM membership m WHERE m.user_id = ${userId} AND m.company_id = ${companyId} AND m.active)
    RETURNING s.id`;
  return rows.length > 0;
}

export async function listUserCompanies(sql: postgres.Sql, userId: number) {
  return sql<{ id: number; name: string; org_no: string; role: Role }[]>`
    SELECT c.id, c.name, c.org_no, m.role FROM membership m JOIN company c ON c.id = m.company_id
    WHERE m.user_id = ${userId} AND m.active ORDER BY c.name`;
}

/** Selvregistrering: ny bruker og nytt firma, der brukeren blir administrator. */
export async function registerCompanyWithAdmin(sql: postgres.Sql, user: NewUser, company: CompanyInput) {
  return sql.begin(async (tx) => {
    const userId = await createUser(tx, user);
    const companyId = await createCompany(tx, company, normalizeEmail(user.email));
    await tx`INSERT INTO membership (user_id, company_id, role) VALUES (${userId}, ${companyId}, 'admin')`;
    return { userId, companyId };
  }) as Promise<{ userId: number; companyId: number }>;
}

/** En innlogget bruker legger til et nytt firma og blir administrator for det. */
export async function addCompanyForUser(sql: postgres.Sql, user: UserRow, company: CompanyInput): Promise<number> {
  return sql.begin(async (tx) => {
    const companyId = await createCompany(tx, company, user.email);
    await tx`INSERT INTO membership (user_id, company_id, role) VALUES (${user.id}, ${companyId}, 'admin')`;
    return companyId;
  }) as Promise<number>;
}

export interface MemberRow {
  user_id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  last_login_at: string | null;
}

export async function listMembers(sql: postgres.Sql, companyId: number): Promise<MemberRow[]> {
  return sql<MemberRow[]>`
    SELECT u.id AS user_id, u.email, u.name, m.role, m.active,
           to_char(u.last_login_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD HH24:MI') AS last_login_at
    FROM membership m JOIN app_user u ON u.id = m.user_id
    WHERE m.company_id = ${companyId}
    ORDER BY m.active DESC, u.name`;
}

/** Endrer rolle eller deaktiverer en bruker i firmaet. Firmaet må alltid ha minst én aktiv administrator. */
export async function updateMember(
  sql: postgres.Sql,
  companyId: number,
  actor: UserRow,
  userId: number,
  change: { role: Role; active: boolean },
): Promise<void> {
  if (userId === actor.id) throw new UserError("Du kan ikke endre din egen rolle eller deaktivere deg selv");
  await sql.begin(async (tx) => {
    const members = await tx<{ user_id: number; role: Role; active: boolean }[]>`
      SELECT user_id, role, active FROM membership WHERE company_id = ${companyId} FOR UPDATE`;
    if (!members.some((m) => m.user_id === userId)) throw new UserError("Fant ikke brukeren i firmaet");
    const admins = members.filter((m) =>
      m.user_id === userId ? change.active && change.role === "admin" : m.active && m.role === "admin",
    );
    if (admins.length === 0) throw new UserError("Firmaet må ha minst én aktiv administrator");
    await tx`UPDATE membership SET role = ${change.role}, active = ${change.active}
             WHERE company_id = ${companyId} AND user_id = ${userId}`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, ${actor.email}, 'update', 'membership', ${String(userId)}, ${tx.json(change)})`;
  });
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Lager en invitasjon og returnerer engangstokenet som skal i lenken. */
export async function createInvitation(
  sql: postgres.Sql,
  companyId: number,
  actor: UserRow,
  emailInput: string,
  role: Role,
): Promise<string> {
  const email = normalizeEmail(emailInput);
  const err = validateEmail(email);
  if (err) throw new UserError(err);
  const token = randomBytes(32).toString("base64url");
  await sql.begin(async (tx) => {
    const [member] = await tx<{ active: boolean }[]>`
      SELECT m.active FROM membership m JOIN app_user u ON u.id = m.user_id
      WHERE m.company_id = ${companyId} AND lower(u.email) = ${email}`;
    if (member?.active) throw new UserError("Brukeren har allerede tilgang til firmaet");
    await tx`UPDATE invitation SET revoked_at = now()
             WHERE company_id = ${companyId} AND lower(email) = ${email} AND accepted_at IS NULL AND revoked_at IS NULL`;
    await tx`INSERT INTO invitation (company_id, email, role, token_hash, invited_by, expires_at)
             VALUES (${companyId}, ${email}, ${role}, ${hashToken(token)}, ${actor.id},
                     now() + make_interval(days => ${INVITATION_DAYS}))`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${companyId}, ${actor.email}, 'invite', 'invitation', ${email}, ${tx.json({ role })})`;
  });
  return token;
}

export interface InvitationRow {
  id: number;
  email: string;
  role: Role;
  created_at: string;
  expires_at: string;
  expired: boolean;
}

export async function listInvitations(sql: postgres.Sql, companyId: number): Promise<InvitationRow[]> {
  return sql<InvitationRow[]>`
    SELECT id, email, role, to_char(created_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD') AS created_at,
           to_char(expires_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM-DD') AS expires_at, expires_at < now() AS expired
    FROM invitation
    WHERE company_id = ${companyId} AND accepted_at IS NULL AND revoked_at IS NULL
    ORDER BY created_at DESC`;
}

export async function revokeInvitation(sql: postgres.Sql, companyId: number, actor: UserRow, id: number): Promise<void> {
  const rows = await sql`UPDATE invitation SET revoked_at = now()
    WHERE id = ${id} AND company_id = ${companyId} AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`;
  if (!rows.length) throw new UserError("Fant ikke invitasjonen");
  await sql`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
            VALUES (${companyId}, ${actor.email}, 'revoke', 'invitation', ${String(id)}, NULL)`;
}

export interface InvitationInfo {
  id: number;
  company_id: number;
  company_name: string;
  email: string;
  role: Role;
  user_exists: boolean;
}

/** Slår opp en gyldig (ikke brukt, ikke trukket tilbake, ikke utløpt) invitasjon. */
export async function getInvitation(sql: Db, token: string): Promise<InvitationInfo | null> {
  if (!token || token.length > 100) return null;
  const [row] = await sql<InvitationInfo[]>`
    SELECT i.id, i.company_id, c.name AS company_name, i.email, i.role,
           EXISTS (SELECT 1 FROM app_user u WHERE lower(u.email) = lower(i.email)) AS user_exists
    FROM invitation i JOIN company c ON c.id = i.company_id
    WHERE i.token_hash = ${hashToken(token)} AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`;
  return row ?? null;
}

/**
 * Godtar en invitasjon. Enten er brukeren allerede bekreftet (innlogget eller riktig passord),
 * eller så opprettes en ny bruker med navn og passord.
 */
export async function acceptInvitation(
  sql: postgres.Sql,
  token: string,
  who: { userId: number } | { name: string; password: string },
): Promise<{ userId: number; companyId: number }> {
  return sql.begin(async (tx) => {
    const [lock] = await tx<{ id: number }[]>`SELECT id FROM invitation WHERE token_hash = ${hashToken(token)} FOR UPDATE`;
    const inv = lock ? await getInvitation(tx, token) : null;
    if (!inv) throw new UserError("Invitasjonen er ugyldig, brukt eller utløpt");
    let userId: number;
    if ("userId" in who) {
      const [u] = await tx<{ email: string }[]>`SELECT email FROM app_user WHERE id = ${who.userId}`;
      if (!u || normalizeEmail(u.email) !== normalizeEmail(inv.email)) {
        throw new UserError(`Invitasjonen gjelder ${inv.email}`);
      }
      userId = who.userId;
    } else {
      userId = await createUser(tx, { email: inv.email, name: who.name, password: who.password });
    }
    await tx`INSERT INTO membership (user_id, company_id, role) VALUES (${userId}, ${inv.company_id}, ${inv.role})
             ON CONFLICT (user_id, company_id) DO UPDATE SET role = EXCLUDED.role, active = true`;
    await tx`UPDATE invitation SET accepted_at = now() WHERE id = ${inv.id}`;
    await tx`INSERT INTO audit_log (company_id, actor, action, entity, entity_id, data)
             VALUES (${inv.company_id}, ${normalizeEmail(inv.email)}, 'accept', 'invitation', ${String(inv.id)}, ${tx.json({ role: inv.role })})`;
    return { userId, companyId: inv.company_id };
  }) as Promise<{ userId: number; companyId: number }>;
}

export async function updateProfile(sql: postgres.Sql, userId: number, p: { name: string; email: string }): Promise<void> {
  const email = normalizeEmail(p.email);
  const err = validateEmail(email);
  if (err) throw new UserError(err);
  if (!p.name.trim()) throw new UserError("Navn mangler");
  const other = await findUserByEmail(sql, email);
  if (other && other.id !== userId) throw new UserError("E-postadressen brukes av en annen bruker");
  await sql`UPDATE app_user SET name = ${p.name.trim()}, email = ${email} WHERE id = ${userId}`;
}

/** Bytter passord og logger ut alle andre økter for brukeren. */
export async function changePassword(
  sql: postgres.Sql,
  userId: number,
  keepSessionId: string,
  current: string,
  next: string,
): Promise<void> {
  const [u] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM app_user WHERE id = ${userId}`;
  if (!u || !(await verifyPassword(current, u.password_hash))) throw new UserError("Nåværende passord er feil");
  const err = validatePassword(next);
  if (err) throw new UserError(err);
  await sql`UPDATE app_user SET password_hash = ${await hashPassword(next)} WHERE id = ${userId}`;
  await sql`DELETE FROM user_session WHERE user_id = ${userId} AND id <> ${keepSessionId}`;
}
