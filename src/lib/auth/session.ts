/**
 * Innloggingsøkten er en HMAC-signert informasjonskapsel med øktens id. Middleware sjekker
 * bare signaturen (Web Crypto), mens serveren slår opp økten, brukeren og tilgangen i databasen.
 */
export const SESSION_COOKIE = "regnskap_sesjon";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 timer

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET må være satt og minst 32 tegn");
  return s;
}

export async function createSessionToken(user: string, secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${encodeURIComponent(user)}.${exp}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  if (!timingSafeEqual(sig, await hmac(secret, `${user}.${exp}`))) return null;
  if (Number(exp) * 1000 < now) return null;
  return decodeURIComponent(user);
}

/** Sjekker mot APP_USER og APP_PASSWORD. Brukes bare til å opprette den første brukeren. */
export function checkCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.APP_USER;
  const expectedPassword = process.env.APP_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;
  const okUser = timingSafeEqual(user.trim().toLowerCase(), expectedUser.trim().toLowerCase());
  const okPassword = timingSafeEqual(password, expectedPassword);
  return okUser && okPassword;
}

/** Godtar bare interne stier som videresending etter innlogging. */
export function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
