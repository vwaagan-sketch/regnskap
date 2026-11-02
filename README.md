# Regnskap

Faktura- og regnskapsprogram for eget firma, laget etter norske regler (bokføringsloven, bokføringsforskriften, MVA, SAF-T, EHF/Peppol).

Plan, lovkrav og veikart: se prosjektdokumentet «Faktura- og regnskapsprogram: lovkrav, arkitektur og MVP».

## Funksjoner

- **Oversikt** med bank, kundefordringer, resultat, MVA å betale og graf per måned.
- **Kvittering:** ta bilde med mobilen, Claude leser av leverandør, beløp og MVA, du retter og bokfører. Originalen arkiveres.
- **Bilag:** manuelle bilag med fri postering, automatisk MVA-splitt og vedlegg (ny fil eller fra arkivet). Søkbar bilagsliste.
- **Arkiv:** dra-og-slipp-opplasting av bilder, PDF og andre filer. Ingenting kan slettes; oppbevaringsfrist vises.
- **Fakturaer:** kunderegister med oppslag i Brønnøysundregistrene, fakturaer med løpenummer og KID, utskrift/PDF, kreditnota og registrering av innbetaling.
- **Kontoplan og varer:** egne kontoer med standard MVA, vareregister som fyller ut fakturalinjer.
- **Rapporter:** resultatregnskap og balanse (med fjorårstall), hovedbok per konto og kundespesifikasjon. Kan skrives ut.
- **MVA-melding:** oppstilling per MVA-kode for hver termin (eller årstermin), og bokføring av oppgjøret til 2740.
- **EHF:** hver faktura og kreditnota kan lastes ned som EHF (Peppol BIS Billing 3.0).
- **Eksport:** SAF-T Regnskap 1.30 per år eller måned, og full sikkerhetskopi (ZIP med SAF-T, alle bilag, fakturaer og revisjonslogg).
- **Saldobalanse** per år.
- **Bank:** importer kontoutskrift som CAMT.053 (XML) eller CSV fra nettbanken. Programmet foreslår avstemming mot kundefakturaer (KID, fakturanummer, beløp) og bokførte bilag (samme beløp, nær dato). Sikre forslag godkjennes samlet; resten bokføres direkte fra banklinjen med kontoutskriften som vedlegg. Avstemmingsrapporten viser saldo i banken mot konto 1920 og hva differansen består av. Automatisk henting fra banken (PSD2) krever avtale med en tilbyder og kommer senere.

### Lovkrav: dette er dekket, og dette gjenstår

| Krav | Status |
| --- | --- |
| Bokføring (bokføringsloven § 4–§ 10) | Fortløpende bilagsnummer, posteringer kan ikke endres eller slettes, revisjonslogg. |
| Spesifikasjoner (bokføringsforskriften § 3-1) | Bilagsjournal, hovedbok, kundespesifikasjon, MVA-oppstilling, resultat og balanse. Leverandørspesifikasjon mangler (krever leverandørregister). |
| SAF-T Regnskap | Eksport i versjon 1.30. Bør kjøres gjennom Skatteetatens SAF-T-validator før den brukes ved kontroll. Gruppering mot næringsspesifikasjonen (GroupingCategory/GroupingCode) er ikke lagt inn. |
| MVA-melding | Tallene per kode vises og føres inn på skatteetaten.no. Direkte innsending krever registrering som sluttbrukersystem hos Skatteetaten og ID-porten. |
| Skattemelding | Resultat og balanse er grunnlag. Næringsspesifikasjonen leveres i Altinn eller via et eget program. |
| Faktura og EHF | Pliktige opplysninger, løpenummer og EHF-fil. Sending via Peppol krever avtale med et aksesspunkt. |
| Oppbevaring i 5 år | Bilag med oppbevaringsfrist og SHA-256, ingen sletting, data i EØS (Frankfurt). Krever betalt database hos Render for varig drift og sikkerhetskopi. |

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

## Innlogging

Plattformen har flere firma og flere brukere. Hvert firma har sitt eget regnskap, sine egne kunder, fakturaer, dokumenter og brukere, og ingen ser data fra andre firma.

- **Registrering:** Nye firma registrerer seg selv på `/registrer`. Den som registrerer blir administrator. Sett `ALLOW_SIGNUP=false` for å stenge selvregistrering.
- **Roller per firma:** *Administrator* (alt, også firmaopplysninger og brukere), *Regnskapsfører* (føre bilag, fakturere, kunder og varer) og *Kun lesetilgang*.
- **Brukere:** Administratoren inviterer under *Brukere*. Invitasjonen er en engangslenke som virker i 14 dager. Administratoren kan endre rolle og fjerne tilgang; firmaet har alltid minst én aktiv administrator.
- **Flere firma per bruker:** En bruker kan ha tilgang til flere firma (f.eks. en regnskapsfører) og bytter firma i menyen øverst til venstre. *Legg til firma* oppretter et nytt firma der brukeren blir administrator.
- **Første innlogging etter oppgradering:** Så lenge ingen brukere finnes, kan man logge inn med `APP_USER` og `APP_PASSWORD`. Da opprettes den første brukeren, som blir administrator for alle eksisterende firma. Bytt deretter til e-postadressen din under *Min profil*. Etter dette brukes ikke variablene lenger.
- **Sikkerhet:** Passord lagres som scrypt-hash. Økter lagres i databasen, så utlogging, passordbytte og fjernet tilgang virker med en gang. `SESSION_SECRET` (minst 32 tegn) signerer innloggingskapselen. Alle spørringer avgrenses til aktivt firma, og databasen har i tillegg sperrer som hindrer at posteringer, fakturaer og betalinger kobles til data i et annet firma.
- Sett gjerne `APP_URL` (f.eks. `https://regnskap.onrender.com`) slik at invitasjonslenkene får riktig adresse.

Alle sider og API-er krever innlogging, unntatt `/logg-inn`, `/registrer`, `/invitasjon/…` og `/api/helse`.

## Drift på Render

- Webtjeneste: bygg `npm ci && npm run build`, start `npm run migrate && npm start`.
- Database: Render PostgreSQL i Frankfurt (EU).
- Miljøvariabler: `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, og valgfritt `APP_URL`, `ALLOW_SIGNUP`. `APP_USER`/`APP_PASSWORD` trengs bare for å opprette første bruker.
- Oppsettet er beskrevet i `render.yaml` (Render Blueprint).
- Adresse: https://regnskap.onrender.com. Hver push til `main` deployes automatisk.

### Varig drift

- Gratis webtjeneste sovner etter 15 minutter uten trafikk og bruker opptil ett minutt på å våkne. Starter-planen holder den våken.
- Gratis database slettes 30 dager etter at den ble opprettet. Oppgrader til en betalt database (Basic) før det, ellers forsvinner regnskapet. Regnskapsdata skal oppbevares i fem år (bokføringsloven § 13).

### Eget domene (valgfritt)

1. Kjøp et domene, f.eks. `firmanavn.no` hos Domeneshop eller One.com (`.no` krever organisasjonsnummer).
2. I Render: tjenesten *regnskap* → *Settings* → *Custom Domains* → legg til f.eks. `regnskap.firmanavn.no`.
3. Hos domeneleverandøren: lag en CNAME-post fra `regnskap` til `regnskap.onrender.com`.
4. Render lager HTTPS-sertifikat automatisk når DNS er på plass.

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
