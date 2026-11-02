-- Bankimport og bankavstemming.
-- Kontoutskrifter (CAMT.053 eller CSV) arkiveres som dokument, og hver banktransaksjon lagres én gang.
-- Importerte data fra banken kan ikke endres eller slettes.

CREATE TABLE bank_statement (
  id            bigserial PRIMARY KEY,
  company_id    int NOT NULL REFERENCES company(id),
  format        text NOT NULL CHECK (format IN ('camt053','csv')),
  account_no    text,                 -- kontonummer fra filen, hvis oppgitt
  statement_ref text,                 -- bankens id for utskriften (CAMT Stmt/Id)
  from_date     date,
  to_date       date,
  opening_ore   bigint,               -- inngående saldo, hvis oppgitt
  closing_ore   bigint,               -- utgående saldo, hvis oppgitt
  document_id   uuid NOT NULL REFERENCES document(id),
  imported_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_transaction (
  id            bigserial PRIMARY KEY,
  company_id    int NOT NULL REFERENCES company(id),
  statement_id  bigint NOT NULL REFERENCES bank_statement(id),
  booking_date  date NOT NULL,
  value_date    date,
  amount_ore    bigint NOT NULL CHECK (amount_ore <> 0),  -- positivt = inn på konto, negativt = ut
  description   text NOT NULL,
  counterparty  text,
  reference     text,                 -- KID eller annen strukturert referanse
  bank_ref      text,                 -- bankens arkivreferanse
  dedupe_key    text NOT NULL,        -- hindrer at samme transaksjon importeres to ganger
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, dedupe_key)
);
CREATE INDEX bank_transaction_date_idx ON bank_transaction (company_id, booking_date);

CREATE TRIGGER bank_statement_immutable BEFORE UPDATE OR DELETE ON bank_statement
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER bank_transaction_immutable BEFORE UPDATE OR DELETE ON bank_transaction
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Avstemming: kobling mellom en banktransaksjon og posteringen som dokumenterer den.
--   invoice_payment: innbetaling bokført mot kundefaktura fra banklinjen
--   new_entry:       ny postering laget fra banklinjen
--   existing_entry:  koblet til en postering som allerede var bokført
CREATE TABLE bank_match (
  id             bigserial PRIMARY KEY,
  company_id     int NOT NULL REFERENCES company(id),
  transaction_id bigint NOT NULL UNIQUE REFERENCES bank_transaction(id),
  entry_id       bigint NOT NULL UNIQUE REFERENCES journal_entry(id),
  kind           text NOT NULL CHECK (kind IN ('invoice_payment','new_entry','existing_entry')),
  created_by     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- En kobling kan ikke endres. Bare koblinger til eksisterende posteringer kan fjernes;
-- posteringer laget fra banklinjen rettes med reverserende postering.
CREATE FUNCTION guard_bank_match() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.kind = 'existing_entry' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Avstemmingen kan ikke endres. Rett med en reverserende postering.';
END $$;
CREATE TRIGGER bank_match_guard BEFORE UPDATE OR DELETE ON bank_match
  FOR EACH ROW EXECUTE FUNCTION guard_bank_match();
