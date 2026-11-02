# Regnskap

Faktura- og regnskapsprogram for eget firma, laget etter norske regler (bokføringsloven, bokføringsforskriften, MVA, SAF-T, EHF/Peppol).

Plan, lovkrav og veikart: se prosjektdokumentet «Faktura- og regnskapsprogram: lovkrav, arkitektur og MVP».

## Funksjoner

- **Oversikt** med bank, kundefordringer, resultat, MVA å betale og graf per måned.
- **Kvittering:** ta bilde med mobilen, Claude leser av leverandør, beløp og MVA, du retter og bokfører. Originalen arkiveres.
- **Bilag:** manuelle bilag med fri postering, automatisk MVA-splitt og vedlegg (ny fil eller fra arkivet). Søkbar bilagsliste.
- **Arkiv:** dra-og-slipp-opplasting av bilder, PDF og andre filer. Ingenting kan slettes; oppbevaringsfrist vises.
- **Bilag på e-post:** hvert firma har en egen innboksadresse. Videresendte kvitteringer og regninger havner i arkivet under «Ikke bokført».
- **Fakturaer:** kunderegister med oppslag i Brønnøysundregistrene, fakturaer med løpenummer og KID, utskrift/PDF, kreditnota og registrering av innbetaling.
- **Saldobalanse** per år.

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

Appen har én bruker. Sett `APP_USER`, `APP_PASSWORD` og `SESSION_SECRET` (minst 32 tegn). Alle sider og API-er krever innlogging, unntatt `/logg-inn`, `/api/helse` og `/api/innboks/*` (som har eget webhook-passord).

## Drift på Render

- Webtjeneste: bygg `npm ci && npm run build`, start `npm run migrate && npm start`.
- Database: Render PostgreSQL i Frankfurt (EU).
- Miljøvariabler: `DATABASE_URL`, `APP_USER`, `APP_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, og for bilag på e-post `INNBOKS_ADRESSE` og `INNBOKS_WEBHOOK_PASSORD`.
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

## Bilag på e-post (Postmark)

E-post tas imot av [Postmark](https://postmarkapp.com), som sender hver e-post som JSON til appen. Hvert firma får adressen `<grunnadresse>+<kode>@<domene>`, der koden er tilfeldig og kan byttes under *Firma*. Bare e-post fra godkjente avsendere tas imot.

1. Lag konto på postmarkapp.com og opprett en *Server* (f.eks. «regnskap»).
2. Gå til serverens *Default Inbound Stream* → *Settings*. Kopier *Inbound email address* (f.eks. `1a2b3c…@inbound.postmarkapp.com`).
3. Lag et passord: `openssl rand -hex 24`.
4. Fyll inn *Webhook URL*: `https://postmark:<passord>@regnskap.onrender.com/api/innboks/postmark`.
5. I Render: legg inn `INNBOKS_ADRESSE` = adressen fra punkt 2 og `INNBOKS_WEBHOOK_PASSORD` = passordet fra punkt 3.
6. I appen: *Firma* → *Bilag på e-post*: legg inn hvem som får sende (din e-postadresse, eller `@firma.no`), og kopier firmaets adresse.

Med eget domene kan du i stedet bruke f.eks. `bilag@firmanavn.no`: legg en MX-post for domenet (eller et underdomene) til `inbound.postmarkapp.com`, sett *Inbound domain* i Postmark og `INNBOKS_ADRESSE=bilag@firmanavn.no`.

Postmark prøver på nytt hvis appen sover eller svarer med feil, og samme e-post arkiveres aldri to ganger. Avviste e-poster (ukjent avsender, feilet SPF, søppelpost) logges under *Firma*.

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
