-- Grunnskjema. Posteringer og utstedte fakturaer er uforanderlige (bokføringsloven § 9).

CREATE TABLE company (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  org_no        char(9) NOT NULL UNIQUE,
  address       text NOT NULL,
  postal_code   text NOT NULL,
  city          text NOT NULL,
  vat_registered boolean NOT NULL DEFAULT true,
  in_business_register boolean NOT NULL DEFAULT true,
  bank_account  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE account (
  company_id int NOT NULL REFERENCES company(id),
  number     char(4) NOT NULL,
  name       text NOT NULL,
  PRIMARY KEY (company_id, number)
);

CREATE TABLE customer (
  id          serial PRIMARY KEY,
  company_id  int NOT NULL REFERENCES company(id),
  customer_no int NOT NULL,
  name        text NOT NULL,
  org_no      char(9),
  email       text,
  peppol_id   text,
  address     text NOT NULL,
  postal_code text NOT NULL,
  city        text NOT NULL,
  UNIQUE (company_id, customer_no)
);

-- Dokumentarkiv: originaler (PDF, EHF-XML, bilder) lagres i objektlager med object lock.
CREATE TABLE document (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  int NOT NULL REFERENCES company(id),
  kind        text NOT NULL,          -- invoice_pdf, ehf_xml, receipt_image, ...
  storage_key text NOT NULL,
  sha256      char(64) NOT NULL,
  retain_until date NOT NULL,         -- minst 5 år etter regnskapsårets slutt
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Løpende fakturanummer uten hull: tildeles i samme transaksjon som fakturaen utstedes.
CREATE TABLE invoice_number_series (
  company_id  int PRIMARY KEY REFERENCES company(id),
  next_number int NOT NULL DEFAULT 1
);

CREATE TABLE invoice (
  id            serial PRIMARY KEY,
  company_id    int NOT NULL REFERENCES company(id),
  kind          text NOT NULL CHECK (kind IN ('invoice','credit_note')),
  number        int NOT NULL,
  customer_id   int NOT NULL REFERENCES customer(id),
  issue_date    date NOT NULL,
  due_date      date NOT NULL,
  delivery_date date NOT NULL,
  kid           text,
  credits_invoice_id int REFERENCES invoice(id),
  net_ore       bigint NOT NULL,
  vat_ore       bigint NOT NULL,
  gross_ore     bigint NOT NULL,
  snapshot      jsonb NOT NULL,       -- komplett faktura slik den ble utstedt
  pdf_document_id uuid REFERENCES document(id),
  ehf_document_id uuid REFERENCES document(id),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);

CREATE TABLE journal_entry (
  id           bigserial PRIMARY KEY,
  company_id   int NOT NULL REFERENCES company(id),
  voucher_no   int NOT NULL,
  entry_date   date NOT NULL,
  description  text NOT NULL,
  document_ref text NOT NULL,
  reverses_id  bigint REFERENCES journal_entry(id),
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, voucher_no)
);

CREATE TABLE journal_line (
  id          bigserial PRIMARY KEY,
  entry_id    bigint NOT NULL REFERENCES journal_entry(id),
  company_id  int NOT NULL,
  account     char(4) NOT NULL,
  amount_ore  bigint NOT NULL CHECK (amount_ore <> 0),
  vat_code    text,
  description text,
  FOREIGN KEY (company_id, account) REFERENCES account(company_id, number)
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  company_id int,
  actor      text NOT NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  data       jsonb,
  at         timestamptz NOT NULL DEFAULT now()
);

-- Uforanderlighet: blokker UPDATE og DELETE på bokførte data.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Tabellen % er uforanderlig. Rett med en ny postering eller kreditnota.', TG_TABLE_NAME;
END $$;

CREATE TRIGGER journal_entry_immutable BEFORE UPDATE OR DELETE ON journal_entry
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER journal_line_immutable BEFORE UPDATE OR DELETE ON journal_line
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER invoice_immutable BEFORE UPDATE OR DELETE ON invoice
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER document_immutable BEFORE UPDATE OR DELETE ON document
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Balansekontroll: hver postering må summere til 0 ved commit.
CREATE FUNCTION check_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s bigint; n int;
BEGIN
  SELECT coalesce(sum(amount_ore),0), count(*) INTO s, n FROM journal_line WHERE entry_id = NEW.id;
  IF n < 2 OR s <> 0 THEN
    RAISE EXCEPTION 'Postering % balanserer ikke (sum %, % linjer)', NEW.id, s, n;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON journal_entry
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_entry_balanced();
