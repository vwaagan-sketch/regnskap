-- Egne kontoer: standard MVA-behandling og mulighet til å skjule kontoer som ikke brukes.
ALTER TABLE account ADD COLUMN vat_category text CHECK (vat_category IN ('high','medium','low','zero','exempt'));
ALTER TABLE account ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE account ADD COLUMN custom boolean NOT NULL DEFAULT false;
ALTER TABLE account ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- Kontoer som er brukt i hovedboken kan ikke slettes.
CREATE FUNCTION forbid_delete_used_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM journal_line WHERE company_id = OLD.company_id AND account = OLD.number) THEN
    RAISE EXCEPTION 'Konto % er brukt i regnskapet og kan ikke slettes', OLD.number;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER account_delete_guard BEFORE DELETE ON account
  FOR EACH ROW EXECUTE FUNCTION forbid_delete_used_account();

-- Vareregister: varer og tjenester som kan brukes på fakturaer.
CREATE TABLE product (
  id              serial PRIMARY KEY,
  company_id      int NOT NULL REFERENCES company(id),
  product_no      text NOT NULL,
  name            text NOT NULL,
  description     text,
  unit            text NOT NULL DEFAULT 'stk',
  price_ore       bigint NOT NULL CHECK (price_ore >= 0),
  vat_category    text NOT NULL CHECK (vat_category IN ('high','medium','low','zero','exempt')),
  revenue_account char(4) NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_no),
  FOREIGN KEY (company_id, revenue_account) REFERENCES account(company_id, number)
);
