"use server";

import { getSql } from "@/db/client";
import { createPasswordReset, PASSWORD_RESET_MINUTES } from "@/db/user-repo";
import { baseUrl } from "@/lib/base-url";
import { mailConfigured, sendMail } from "@/lib/mail";

export interface ForgotState {
  sent: boolean;
  error: string | null;
}

/** Sender lenke for nytt passord. Svarer likt uansett om e-posten finnes, så ingen kan finne ut hvem som har konto. */
export async function forgotAction(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  const sql = getSql();
  if (!sql) return { sent: false, error: "Databasen er ikke koblet til" };
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { sent: false, error: "Skriv inn e-postadressen din" };
  const started = Date.now();
  try {
    const reset = await createPasswordReset(sql, email);
    if (reset) {
      const link = `${await baseUrl()}/nytt-passord/${reset.token}`;
      if (mailConfigured()) {
        await sendMail({
          to: reset.user.email,
          subject: "Nytt passord til Regnskap",
          text: `Hei ${reset.user.name},\n\nNoen (forhåpentligvis du) har bedt om å lage nytt passord. Åpne lenken for å velge et nytt passord:\n\n${link}\n\nLenken virker i ${PASSWORD_RESET_MINUTES} minutter og kan bare brukes én gang. Har du ikke bedt om dette, kan du se bort fra e-posten.\n`,
        });
      } else {
        // Uten e-postoppsett skrives lenken i serverloggen, som bare eieren av tjenesten kan lese.
        console.warn(`[nytt passord] E-post er ikke satt opp. Lenke for ${reset.user.email}: ${link}`);
      }
    }
  } catch (e) {
    console.error("[nytt passord]", e);
    return { sent: false, error: "Kunne ikke sende e-post akkurat nå. Prøv igjen om litt." };
  }
  // Lik svartid uansett utfall.
  await new Promise((r) => setTimeout(r, Math.max(0, 1500 - (Date.now() - started))));
  return { sent: true, error: null };
}
