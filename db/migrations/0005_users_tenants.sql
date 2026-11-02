-- Brukere, roller og flere firma på samme plattform.

CREATE TABLE app_user (
  id            serial PRIMARY KEY,
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX app_user_email_idx ON app_user (lower(email));

-- Tilgang til et firma. Roller: admin (alt, også brukere og firma), regnskap (føre bilag og fakturere), lese (kun lese).
CREATE TABLE membership (
  user_id    int NOT NULL REFERENCES app_user(id),
  company_id int NOT NULL REFERENCES company(id),
  role       text NOT NULL CHECK (role IN ('admin','regnskap','lese')),
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);
CREATE INDEX membership_company_idx ON membership (company_id);

-- Invitasjoner sendes som lenke. Bare hash av tokenet lagres.
CREATE TABLE invitation (
  id          serial PRIMARY KEY,
  company_id  int NOT NULL REFERENCES company(id),
  email       text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin','regnskap','lese')),
  token_hash  char(64) NOT NULL UNIQUE,
  invited_by  int NOT NULL REFERENCES app_user(id),
  expires_at  timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitation_company_idx ON invitation (company_id);

-- Innloggingsøkter. Lagres i databasen slik at utlogging og deaktivering virker umiddelbart.
CREATE TABLE user_session (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    int NOT NULL REFERENCES app_user(id),
  company_id int REFERENCES company(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX user_session_user_idx ON user_session (user_id);

-- Ekstra sikring mot at data fra ett firma kobles til et annet firma.
CREATE FUNCTION check_same_company() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE other int;
BEGIN
  IF TG_TABLE_NAME = 'journal_entry' THEN
    IF NEW.document_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO other FROM document WHERE id = NEW.document_id;
  ELSIF TG_TABLE_NAME = 'journal_line' THEN
    SELECT company_id INTO other FROM journal_entry WHERE id = NEW.entry_id;
  ELSIF TG_TABLE_NAME = 'invoice' THEN
    SELECT company_id INTO other FROM customer WHERE id = NEW.customer_id;
    IF other IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Kunden tilhører et annet firma';
    END IF;
    IF NEW.credits_invoice_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO other FROM invoice WHERE id = NEW.credits_invoice_id;
  ELSIF TG_TABLE_NAME = 'invoice_payment' THEN
    SELECT company_id INTO other FROM invoice WHERE id = NEW.invoice_id;
    IF other IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Fakturaen tilhører et annet firma';
    END IF;
    SELECT company_id INTO other FROM journal_entry WHERE id = NEW.entry_id;
  END IF;
  IF other IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Data i % peker til et annet firma', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER journal_entry_same_company BEFORE INSERT ON journal_entry
  FOR EACH ROW EXECUTE FUNCTION check_same_company();
CREATE TRIGGER journal_line_same_company BEFORE INSERT ON journal_line
  FOR EACH ROW EXECUTE FUNCTION check_same_company();
CREATE TRIGGER invoice_same_company BEFORE INSERT ON invoice
  FOR EACH ROW EXECUTE FUNCTION check_same_company();
CREATE TRIGGER invoice_payment_same_company BEFORE INSERT ON invoice_payment
  FOR EACH ROW EXECUTE FUNCTION check_same_company();
