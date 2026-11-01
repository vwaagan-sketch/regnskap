# Regnskap: retningslinjer for utvikling

- Brukeren skriver norsk; UI-tekster, feilmeldinger og dokumentasjon skrives på norsk (bokmål).
- Beløp er alltid heltall i øre (`number` som er safe integer, `bigint` i databasen). Aldri flyttall for penger.
- Bokførte tabeller (journal_entry, journal_line, invoice, document, audit_log) er uforanderlige. Ikke legg til UPDATE/DELETE mot dem; rett feil med reverserende postering eller kreditnota.
- Alle posteringer går gjennom `validateEntry` og `postEntry`; ingen modul skriver direkte til hovedboken.
- Nye skjemaendringer: ny fil i `db/migrations/` med neste nummer. Endre aldri en migrering som er kjørt.
- Kjør `npm run lint && npm run typecheck && npm test` før commit.
