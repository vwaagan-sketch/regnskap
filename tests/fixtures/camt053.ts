/** Eksempel på kontoutskrift i CAMT.053 brukt i testene. */
export const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>MSG1</MsgId><CreDtTm>2026-11-01T06:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-2026-10</Id>
      <FrToDt><FrDtTm>2026-10-01T00:00:00</FrDtTm><ToDtTm>2026-10-31T23:59:59</ToDtTm></FrToDt>
      <Acct><Id><IBAN>NO9312345678903</IBAN></Id><Ccy>NOK</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="NOK">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-01</Dt></Dt></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="NOK">12940.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-10-31</Dt></Dt></Bal>
      <Ntry>
        <Amt Ccy="NOK">3125.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>2026-10-10</Dt></BookgDt><ValDt><Dt>2026-10-10</Dt></ValDt>
        <AcctSvcrRef>A1</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <AmtDtls><TxAmt><Amt Ccy="NOK">2500.00</Amt></TxAmt></AmtDtls>
            <RltdPties><Dbtr><Nm>Kunde AS</Nm></Dbtr></RltdPties>
            <RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry></Tp><Ref>1000110</Ref></CdtrRefInf></Strd></RmtInf>
          </TxDtls>
          <TxDtls>
            <AmtDtls><TxAmt><Amt Ccy="NOK">625.00</Amt></TxAmt></AmtDtls>
            <RltdPties><Dbtr><Nm>Annen &amp; Kunde</Nm></Dbtr></RltdPties>
            <RmtInf><Ustrd>Faktura 7</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="NOK">125</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts><Cd>BOOK</Cd></Sts>
        <BookgDt><DtTm>2026-10-31T12:00:00</DtTm></BookgDt>
        <AcctSvcrRef>A2</AcctSvcrRef>
        <AddtlNtryInf>Gebyr nettbank</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="NOK">60.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
        <BookgDt><Dt>2026-10-20</Dt></BookgDt>
        <AcctSvcrRef>A3</AcctSvcrRef>
        <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Telenor</Nm></Cdtr></RltdPties><RmtInf><Ustrd>Mobil oktober</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="NOK">999.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>PDNG</Sts>
        <BookgDt><Dt>2026-10-31</Dt></BookgDt>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;
