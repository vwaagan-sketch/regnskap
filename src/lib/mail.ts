/**
 * Sender e-post via Postmark (samme leverandør som innboksen for bilag).
 * Krever POSTMARK_SERVER_TOKEN og EPOST_AVSENDER (en bekreftet avsender i Postmark).
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.EPOST_AVSENDER);
}

export async function sendMail(mail: Mail): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.EPOST_AVSENDER;
  if (!token || !from) throw new Error("E-post er ikke satt opp (POSTMARK_SERVER_TOKEN og EPOST_AVSENDER)");
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({ From: from, To: mail.to, Subject: mail.subject, TextBody: mail.text, MessageStream: "outbound" }),
  });
  if (!res.ok) throw new Error(`Postmark svarte ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
