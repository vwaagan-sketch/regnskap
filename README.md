# Regnskap

Faktura- og regnskapsprogram for eget firma, laget etter norske regler (bokføringsloven, bokføringsforskriften, MVA, SAF-T, EHF/Peppol).

Plan, lovkrav og veikart: se prosjektdokumentet «Faktura- og regnskapsprogram: lovkrav, arkitektur og MVP».

## Status

Første fase (MVP: fakturering) er under arbeid. Dette finnes nå:

- **Bokføringsmotor** (`src/lib/ledger.ts`): dobbel bokføring, balansekontroll, reversering, saldobalanse.
- **Faktura og kreditnota** (`src/lib/invoice.ts`): beregning per MVA-sats i øre, kontroll av pliktige opplysninger, automatisk postering.
- **KID** med MOD10 (`src/lib/kid.ts`).
- **Bildetolkning av regninger** (`src/lib/receipt/scan.ts`, side `/kvittering`): bilde fra mobilkamera tolkes av Claude til et bilagsforslag med kryssjekk av summer og MVA.
- **Database** (`db/migrations`): posteringer, fakturaer, dokumentarkiv og revisjonslogg kan ikke endres eller slettes (triggere), og hver postering må balansere.

## Kom i gang

```bash
cp .env.example .env.local      # fyll inn ANTHROPIC_API_KEY
docker compose up -d            # PostgreSQL
npm install
DATABASE_URL=postgres://regnskap:regnskap@localhost:5432/regnskap npm run migrate
npm run dev                     # http://localhost:3000
```

## Tester

```bash
npm test          # domenetester; databasetester kjører når DATABASE_URL er satt
npm run lint && npm run typecheck
```

## Prinsipper

- Beløp lagres alltid som heltall i øre.
- Bokførte data er append-only. Feil rettes med ny postering eller kreditnota.
- Fakturanummer og bilagsnummer er fortløpende uten hull.
- All lagring i Norge/EØS. Originaldokumenter oppbevares i minst 5 år.

Lovkravene i koden er basert på en første kartlegging og må verifiseres mot Lovdata, Skatteetaten og helst en regnskapsfører før bruk i drift.
