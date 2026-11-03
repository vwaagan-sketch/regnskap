import { headers } from "next/headers";

/**
 * Offentlig adresse til appen, brukt i lenker som sendes ut (invitasjoner, nytt passord).
 * Bruker APP_URL, ellers RENDER_EXTERNAL_URL (settes av Render). Forespørselens Host-header
 * brukes bare utenfor produksjon, slik at ingen kan lure appen til å lage lenker til et annet domene.
 */
export async function baseUrl(): Promise<string> {
  const fixed = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (fixed) return fixed.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL må være satt");
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return `http://${host}`;
}
