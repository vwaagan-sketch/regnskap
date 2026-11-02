/**
 * EHF-faktura og -kreditnota etter Peppol BIS Billing 3.0 (UBL 2.1).
 * Lages fra øyeblikksbildet av den utstedte fakturaen, så filen er den samme hver gang.
 */
import { amount, el, XML_DECL } from "./xml";
import type { InvoiceInput, InvoiceTotals } from "./invoice";
import { VAT_RATES, type VatCategory } from "./vat";

const CBC = "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";
const CAC = "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";

const UNIT_CODES: Record<string, string> = {
  stk: "EA", timer: "HUR", time: "HUR", t: "HUR", dag: "DAY", dager: "DAY", mnd: "MON", måned: "MON",
  km: "KMT", kg: "KGM", m: "MTR", m2: "MTK", l: "LTR", liter: "LTR", pakke: "PK",
};
export const unitCode = (u?: string) => UNIT_CODES[(u ?? "stk").toLowerCase()] ?? "EA";

/** Peppol MVA-kategori: S standard, Z nullsats, E unntatt, O utenfor (selger ikke MVA-registrert). */
function taxCategory(cat: VatCategory, sellerVat: boolean): { id: string; percent: number | null; reason?: string } {
  if (!sellerVat) return { id: "O", percent: null, reason: "Selger er ikke registrert i Merverdiavgiftsregisteret" };
  if (cat === "zero") return { id: "Z", percent: 0 };
  if (cat === "exempt") return { id: "E", percent: 0, reason: "Unntatt merverdiavgift" };
  return { id: "S", percent: VAT_RATES[cat] };
}

function taxCategoryXml(tag: string, t: ReturnType<typeof taxCategory>, withReason: boolean) {
  return el(tag, [
    el("cbc:ID", t.id),
    t.percent !== null ? el("cbc:Percent", t.percent) : null,
    withReason && t.reason ? el("cbc:TaxExemptionReason", t.reason) : null,
    el("cac:TaxScheme", [el("cbc:ID", "VAT")]),
  ]);
}

const nok = (ore: number) => ({ currencyID: "NOK", ore });
function money(tag: string, m: { currencyID: string; ore: number }) {
  return el(tag, amount(m.ore), { currencyID: m.currencyID });
}

function party(p: InvoiceInput["buyer"], extra: string[] = []) {
  return el("cac:Party", [
    p.orgNo ? el("cbc:EndpointID", p.orgNo, { schemeID: "0192" }) : null,
    el("cac:PartyName", [el("cbc:Name", p.name)]),
    el("cac:PostalAddress", [
      el("cbc:StreetName", p.address),
      el("cbc:CityName", p.city),
      el("cbc:PostalZone", p.postalCode),
      el("cac:Country", [el("cbc:IdentificationCode", "NO")]),
    ]),
    extra,
    el("cac:PartyLegalEntity", [
      el("cbc:RegistrationName", p.name),
      p.orgNo ? el("cbc:CompanyID", p.orgNo, { schemeID: "0192" }) : null,
    ]),
  ]);
}

export function ehfErrors(inv: InvoiceInput): string[] {
  const e: string[] = [];
  if (!inv.buyer.orgNo) e.push("EHF krever at kunden har organisasjonsnummer (privatpersoner får vanlig faktura)");
  if (!/^\d{9}$/.test(inv.seller.orgNo)) e.push("Selgers organisasjonsnummer mangler");
  return e;
}

export function buildEhf(inv: InvoiceInput, totals: InvoiceTotals, buyerReference: string): string {
  const errors = ehfErrors(inv);
  if (errors.length) throw new Error(errors.join(". "));
  const credit = inv.kind === "credit_note";
  const abs = Math.abs;
  const s = inv.seller;

  const sellerSchemes = [
    s.vatRegistered ? el("cac:PartyTaxScheme", [el("cbc:CompanyID", `NO${s.orgNo}MVA`), el("cac:TaxScheme", [el("cbc:ID", "VAT")])]) : "",
    s.inBusinessRegister ? el("cac:PartyTaxScheme", [el("cbc:CompanyID", "Foretaksregisteret"), el("cac:TaxScheme", [el("cbc:ID", "TAX")])]) : "",
  ];

  const subtotals = (Object.entries(totals.vatByCategory) as [VatCategory, { baseOre: number; vatOre: number }][]).map(([cat, b]) =>
    el("cac:TaxSubtotal", [
      money("cbc:TaxableAmount", nok(abs(b.baseOre))),
      money("cbc:TaxAmount", nok(abs(b.vatOre))),
      taxCategoryXml("cac:TaxCategory", taxCategory(cat, s.vatRegistered), true),
    ]));

  const lineTag = credit ? "cac:CreditNoteLine" : "cac:InvoiceLine";
  const qtyTag = credit ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity";
  const lines = totals.lines.map((l, i) =>
    el(lineTag, [
      el("cbc:ID", i + 1),
      el(qtyTag, String(l.quantity), { unitCode: unitCode(l.unit) }),
      money("cbc:LineExtensionAmount", nok(abs(l.netOre))),
      el("cac:Item", [
        el("cbc:Name", l.description),
        taxCategoryXml("cac:ClassifiedTaxCategory", taxCategory(l.vatCategory, s.vatRegistered), false),
      ]),
      el("cac:Price", [money("cbc:PriceAmount", nok(l.unitPriceOre))]),
    ]));

  const body = [
    el("cbc:CustomizationID", "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0"),
    el("cbc:ProfileID", "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"),
    el("cbc:ID", inv.number),
    el("cbc:IssueDate", inv.issueDate),
    credit ? null : el("cbc:DueDate", inv.dueDate),
    el(credit ? "cbc:CreditNoteTypeCode" : "cbc:InvoiceTypeCode", credit ? "381" : "380"),
    el("cbc:DocumentCurrencyCode", "NOK"),
    el("cbc:BuyerReference", buyerReference),
    credit && inv.creditsInvoiceNumber
      ? el("cac:BillingReference", [el("cac:InvoiceDocumentReference", [el("cbc:ID", inv.creditsInvoiceNumber)])])
      : null,
    el("cac:AccountingSupplierParty", [party(s, sellerSchemes)]),
    el("cac:AccountingCustomerParty", [party(inv.buyer)]),
    el("cac:Delivery", [el("cbc:ActualDeliveryDate", inv.deliveryDate)]),
    credit ? null : el("cac:PaymentMeans", [
      el("cbc:PaymentMeansCode", "30"),
      inv.kid ? el("cbc:PaymentID", inv.kid) : null,
      el("cac:PayeeFinancialAccount", [el("cbc:ID", s.bankAccount)]),
    ]),
    el("cac:TaxTotal", [money("cbc:TaxAmount", nok(abs(totals.vatOre))), subtotals]),
    el("cac:LegalMonetaryTotal", [
      money("cbc:LineExtensionAmount", nok(abs(totals.netOre))),
      money("cbc:TaxExclusiveAmount", nok(abs(totals.netOre))),
      money("cbc:TaxInclusiveAmount", nok(abs(totals.grossOre))),
      money("cbc:PayableAmount", nok(abs(totals.grossOre))),
    ]),
    lines,
  ];

  const root = credit ? "CreditNote" : "Invoice";
  return XML_DECL + el(root, body, {
    xmlns: `urn:oasis:names:specification:ubl:schema:xsd:${root}-2`,
    "xmlns:cac": CAC,
    "xmlns:cbc": CBC,
  });
}
