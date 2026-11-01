export type InvoiceStatus = "betalt" | "forfalt" | "apen" | "kreditnota" | "kreditert";

export function invoiceStatus(kind: string, gross: number, paid: number, dueDate: string, today: string): InvoiceStatus {
  if (kind === "credit_note") return "kreditnota";
  if (paid >= gross) return "betalt";
  if (dueDate < today) return "forfalt";
  return "apen";
}

export const STATUS_LABEL: Record<InvoiceStatus, { label: string; color: "green" | "red" | "amber" | "gray" | "indigo" }> = {
  betalt: { label: "Betalt", color: "green" },
  forfalt: { label: "Forfalt", color: "red" },
  apen: { label: "Ubetalt", color: "amber" },
  kreditnota: { label: "Kreditnota", color: "indigo" },
  kreditert: { label: "Kreditert", color: "gray" },
};
