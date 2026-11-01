import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ACCOUNT_NAMES } from "../accounts";

/**
 * Tolker bilde av regning/kvittering med Claude og returnerer strukturerte felt.
 * Resultatet er et FORSLAG: brukeren må godkjenne før noe bokføres.
 */
export const ReceiptSchema = z.object({
  documentType: z.enum(["invoice", "receipt", "credit_note", "unknown"]),
  supplierName: z.string(),
  supplierOrgNo: z.string().nullable().describe("9 siffer uten mellomrom, eller null"),
  documentNumber: z.string().nullable(),
  issueDate: z.string().nullable().describe("ISO yyyy-mm-dd"),
  dueDate: z.string().nullable().describe("ISO yyyy-mm-dd"),
  currency: z.string().describe("ISO 4217, normalt NOK"),
  totalInclVatOre: z.number().int().describe("Totalbeløp inkl. MVA i øre"),
  vatLines: z.array(
    z.object({
      ratePercent: z.number().describe("25, 15, 12 eller 0"),
      baseOre: z.number().int().describe("Grunnlag eks. MVA i øre"),
      vatOre: z.number().int().describe("MVA-beløp i øre"),
    }),
  ),
  kid: z.string().nullable(),
  bankAccount: z.string().nullable().describe("11 siffer uten punktum, eller null"),
  suggestedAccount: z.string().describe("Firesifret konto fra kontolisten"),
  description: z.string().describe("Kort beskrivelse av kjøpet på norsk"),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().nullable().describe("Uleselige felt eller annet brukeren bør sjekke"),
});

export type ReceiptData = z.infer<typeof ReceiptSchema>;

const SYSTEM_PROMPT = `Du tolker norske regninger, fakturaer og kvitteringer for et regnskapsprogram.
Les bare det som faktisk står på dokumentet. Er et felt uleselig eller mangler, sett null og forklar i notes.
Beløp oppgis i øre som heltall (123,45 kr = 12345).
Velg suggestedAccount fra denne kontolisten (NS 4102):
${Object.entries(ACCOUNT_NAMES)
  .map(([no, name]) => `${no} ${name}`)
  .join("\n")}`;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function scanReceipt(
  imageBase64: string,
  mediaType: ImageMediaType,
  client = new Anthropic(),
): Promise<{ data: ReceiptData; warnings: string[] }> {
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReceiptSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Tolk dette dokumentet." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Bildet kunne ikke tolkes. Registrer bilaget manuelt.");
  }
  const data = response.parsed_output;
  if (!data) throw new Error("Klarte ikke å lese strukturerte data fra bildet.");
  return { data, warnings: checkReceipt(data) };
}

/** Kryssjekker tallene slik at feil oppdages før brukeren godkjenner. */
export function checkReceipt(data: ReceiptData): string[] {
  const warnings: string[] = [];
  const sumLines = data.vatLines.reduce((s, l) => s + l.baseOre + l.vatOre, 0);
  if (data.vatLines.length > 0 && Math.abs(sumLines - data.totalInclVatOre) > 1) {
    warnings.push("Summen av MVA-linjene stemmer ikke med totalbeløpet.");
  }
  for (const l of data.vatLines) {
    const expected = Math.round((l.baseOre * l.ratePercent) / 100);
    if (![25, 15, 12, 0].includes(l.ratePercent)) warnings.push(`Ukjent MVA-sats ${l.ratePercent} %.`);
    else if (Math.abs(expected - l.vatOre) > 1) warnings.push(`MVA på ${l.ratePercent} % ser feil ut.`);
  }
  if (data.supplierOrgNo && !/^\d{9}$/.test(data.supplierOrgNo)) warnings.push("Org.nr har ikke 9 siffer.");
  if (data.currency !== "NOK") warnings.push(`Beløpet er i ${data.currency}, ikke NOK.`);
  if (!(data.suggestedAccount in ACCOUNT_NAMES)) warnings.push("Foreslått konto finnes ikke i kontoplanen.");
  if (data.confidence === "low") warnings.push("Lav sikkerhet i tolkningen. Sjekk alle felt.");
  return warnings;
}
