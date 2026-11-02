import { z } from "zod";
import type { InboundMessage } from "./message";

const address = z.object({ Email: z.string().default(""), MailboxHash: z.string().optional().nullable() });

/** Feltene vi bruker fra Postmarks «Inbound webhook» (https://postmarkapp.com/developer/webhooks/inbound-webhook). */
const postmarkSchema = z.object({
  MessageID: z.string().min(1),
  From: z.string().default(""),
  FromFull: address.optional().nullable(),
  Subject: z.string().nullish(),
  MailboxHash: z.string().nullish(),
  OriginalRecipient: z.string().nullish(),
  ToFull: z.array(address).nullish(),
  CcFull: z.array(address).nullish(),
  BccFull: z.array(address).nullish(),
  TextBody: z.string().nullish(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).nullish(),
  Attachments: z
    .array(
      z.object({
        Name: z.string().nullish(),
        Content: z.string(),
        ContentType: z.string().nullish(),
        ContentID: z.string().nullish(),
      }),
    )
    .nullish(),
});

export function parsePostmark(payload: unknown): InboundMessage | null {
  const r = postmarkSchema.safeParse(payload);
  if (!r.success) return null;
  const p = r.data;
  const header = (name: string) => p.Headers?.find((h) => h.Name.toLowerCase() === name)?.Value.trim().toLowerCase() ?? "";
  const recipients = [p.OriginalRecipient ?? "", ...[...(p.ToFull ?? []), ...(p.CcFull ?? []), ...(p.BccFull ?? [])].map((a) => a.Email)]
    .filter(Boolean);
  return {
    provider: "postmark",
    messageId: p.MessageID,
    from: (p.FromFull?.Email || p.From).trim().toLowerCase(),
    subject: (p.Subject ?? "").trim(),
    mailboxHash: p.MailboxHash || p.ToFull?.find((a) => a.MailboxHash)?.MailboxHash || null,
    recipients,
    textBody: p.TextBody ?? "",
    suspicious: header("received-spf").startsWith("fail") || header("x-spam-status").startsWith("yes"),
    attachments: (p.Attachments ?? []).map((a, i) => ({
      filename: a.Name?.trim() || `vedlegg-${i + 1}`,
      mediaType: a.ContentType ?? "",
      content: Buffer.from(a.Content, "base64"),
      inline: Boolean(a.ContentID),
    })),
  };
}
