import { NextResponse } from "next/server";
import { getSql } from "@/db/client";
import { receiveEmail } from "@/db/inbox-repo";
import { checkBasicAuth } from "@/lib/inbound/message";
import { parsePostmark } from "@/lib/inbound/postmark";
import { jsonError } from "@/lib/http";

/**
 * Webhook for innkommende e-post fra Postmark. Webhook-adressen legges inn i Postmark som
 * https://postmark:<INNBOKS_WEBHOOK_PASSORD>@<domene>/api/innboks/postmark
 *
 * Svarkoder: 200 = tatt imot (eller allerede mottatt). 403 = avvist; Postmark prøver da ikke på nytt.
 * Andre feil (500/503) får Postmark til å prøve igjen senere.
 */
export async function POST(req: Request) {
  const password = process.env.INNBOKS_WEBHOOK_PASSORD;
  if (!password) return jsonError("Mottak av e-post er ikke satt opp (INNBOKS_WEBHOOK_PASSORD mangler)", 503);
  if (!checkBasicAuth(req.headers.get("authorization"), password)) return jsonError("Feil passord for webhook", 401);

  const sql = getSql();
  if (!sql) return jsonError("Databasen er ikke koblet til", 503);

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError("Ugyldig JSON", 400);
  }
  const msg = parsePostmark(payload);
  if (!msg) return jsonError("Ukjent format på e-posten", 400);

  const result = await receiveEmail(sql, msg);
  if (result.status === "avvist") {
    console.warn(`E-post ${msg.messageId} fra ${msg.from} avvist: ${result.reason}`);
    return jsonError(result.reason, 403);
  }
  return NextResponse.json(result);
}
