import { all, at, find, parseXml, textAt, type XmlNode } from "./xml";
import {
  StatementError, kidFromText, normalizeAccountNo, parseBankDate, parseDecimalOre,
  type BankTransactionInput, type ParsedStatement,
} from "./statement";

/**
 * Leser kontoutskrift i ISO 20022 CAMT.053 (BkToCstmrStmt), versjon 02 til 08.
 * Bare bokførte poster (status BOOK) tas med. Samlepost med flere betalinger (f.eks. OCR/KID-innbetalinger)
 * deles i én transaksjon per betaling når beløpene går opp.
 */
export function isCamt053(text: string): boolean {
  return /<(\w+:)?BkToCstmrStmt[\s>]/.test(text);
}

function signed(node: XmlNode | undefined, amountNode: XmlNode | undefined, what: string): number {
  const amt = amountNode ? parseDecimalOre(amountNode.text) : null;
  if (amt === null) throw new StatementError(`Ugyldig beløp i ${what}`);
  const ccy = amountNode?.attrs.Ccy;
  if (ccy && ccy !== "NOK") throw new StatementError(`Bare NOK støttes foreløpig (fant ${ccy} i ${what})`);
  const ind = textAt(node, "CdtDbtInd");
  if (ind !== "CRDT" && ind !== "DBIT") throw new StatementError(`Mangler CdtDbtInd i ${what}`);
  return ind === "DBIT" ? -amt : amt;
}

function date(node: XmlNode | undefined): string | undefined {
  const v = textAt(node, "Dt") ?? textAt(node, "DtTm");
  return v ? parseBankDate(v) ?? undefined : undefined;
}

function partyName(tx: XmlNode | undefined, role: "Dbtr" | "Cdtr"): string | undefined {
  const p = at(tx, "RltdPties", role);
  return textAt(p, "Nm") ?? textAt(p, "Pty", "Nm");
}

function txInfo(tx: XmlNode | undefined, credit: boolean) {
  const rmt = at(tx, "RmtInf");
  const ustrd = all(rmt, "Ustrd").map((u) => u.text).filter(Boolean).join(" ");
  const kid = all(rmt, "Strd").map((s) => textAt(s, "CdtrRefInf", "Ref")).find(Boolean);
  const e2e = textAt(tx, "Refs", "EndToEndId");
  return {
    counterparty: partyName(tx, credit ? "Dbtr" : "Cdtr"),
    reference: kid ?? kidFromText(ustrd),
    text: [ustrd, e2e && e2e !== "NOTPROVIDED" && !ustrd.includes(e2e) ? e2e : ""].filter(Boolean).join(" "),
    bankRef: textAt(tx, "Refs", "AcctSvcrRef"),
  };
}

function entryStatus(ntry: XmlNode): string | undefined {
  return textAt(ntry, "Sts", "Cd") ?? textAt(ntry, "Sts");
}

function parseEntry(ntry: XmlNode, index: number): BankTransactionInput[] {
  const amount = signed(ntry, at(ntry, "Amt"), `post ${index + 1}`);
  const bookingDate = date(at(ntry, "BookgDt")) ?? date(at(ntry, "ValDt"));
  if (!bookingDate) throw new StatementError(`Post ${index + 1} mangler bokføringsdato`);
  const valueDate = date(at(ntry, "ValDt"));
  const extra = textAt(ntry, "AddtlNtryInf");
  const entryRef = textAt(ntry, "AcctSvcrRef") ?? textAt(ntry, "NtryRef");
  const details = all(ntry, "NtryDtls").flatMap((d) => all(d, "TxDtls"));
  const credit = amount > 0;

  // Samlepost: del opp hvis hver betaling har eget beløp og summen stemmer.
  if (details.length > 1) {
    const parts = details.map((tx) => {
      const amtNode = at(tx, "AmtDtls", "TxAmt", "Amt") ?? at(tx, "Amt");
      const a = amtNode ? parseDecimalOre(amtNode.text) : null;
      return { tx, ore: a === null ? null : (credit ? a : -a) };
    });
    if (parts.every((p) => p.ore !== null && p.ore !== 0) && parts.reduce((s, p) => s + (p.ore ?? 0), 0) === amount) {
      return parts.map(({ tx, ore }, i) => {
        const info = txInfo(tx, credit);
        return {
          bookingDate, valueDate, amountOre: ore!,
          description: info.text || info.counterparty || extra || (credit ? "Innbetaling" : "Utbetaling"),
          counterparty: info.counterparty, reference: info.reference,
          bankRef: info.bankRef ?? (entryRef ? `${entryRef}#${i + 1}` : undefined),
        };
      });
    }
  }

  const info = txInfo(details[0], credit);
  return [{
    bookingDate, valueDate, amountOre: amount,
    description: [extra, info.text].filter(Boolean).join(" ").trim() || info.counterparty || (credit ? "Innbetaling" : "Utbetaling"),
    counterparty: info.counterparty,
    reference: info.reference ?? kidFromText(extra),
    bankRef: entryRef ?? info.bankRef,
  }];
}

export function parseCamt053(text: string): ParsedStatement[] {
  const root = parseXml(text);
  const msg = find(root, "BkToCstmrStmt");
  if (!msg) throw new StatementError("Filen er ikke en CAMT.053-kontoutskrift");
  const stmts = all(msg, "Stmt");
  if (stmts.length === 0) throw new StatementError("Kontoutskriften inneholder ingen Stmt");
  return stmts.map((st) => {
    const acctId = at(st, "Acct", "Id");
    const ccy = textAt(st, "Acct", "Ccy");
    if (ccy && ccy !== "NOK") throw new StatementError(`Bare NOK-kontoer støttes foreløpig (kontoen er i ${ccy})`);
    let openingOre: number | undefined;
    let closingOre: number | undefined;
    let fromDate = parseBankDate(textAt(st, "FrToDt", "FrDtTm") ?? "") ?? undefined;
    let toDate = parseBankDate(textAt(st, "FrToDt", "ToDtTm") ?? "") ?? undefined;
    for (const bal of all(st, "Bal")) {
      const code = textAt(bal, "Tp", "CdOrPrtry", "Cd");
      const v = signed(bal, at(bal, "Amt"), `saldo ${code ?? ""}`.trim());
      if (code === "OPBD" || (code === "PRCD" && openingOre === undefined)) {
        openingOre = v;
        fromDate ??= date(at(bal, "Dt"));
      } else if (code === "CLBD") {
        closingOre = v;
        toDate ??= date(at(bal, "Dt"));
      }
    }
    const entries = all(st, "Ntry").filter((n) => (entryStatus(n) ?? "BOOK") === "BOOK");
    const transactions = entries.flatMap((n, i) => parseEntry(n, i));
    return {
      format: "camt053" as const,
      accountNo: normalizeAccountNo(textAt(acctId, "IBAN") ?? textAt(acctId, "Othr", "Id")),
      statementRef: textAt(st, "Id"),
      fromDate, toDate, openingOre, closingOre,
      transactions,
    };
  });
}
