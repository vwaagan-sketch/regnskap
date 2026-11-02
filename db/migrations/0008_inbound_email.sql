-- Bilag på e-post: hvert firma får en egen, hemmelig innboksadresse.
CREATE TABLE company_inbox (
  company_id      int PRIMARY KEY REFERENCES company(id),
  token           text NOT NULL UNIQUE CHECK (token ~ '^[a-z2-7]{12}$'),
  allowed_senders text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Logg over mottatte e-poster (også avviste), for kontrollspor og for å hindre dobbeltmottak.
CREATE TABLE inbound_email (
  id           serial PRIMARY KEY,
  company_id   int NOT NULL REFERENCES company(id),
  provider     text NOT NULL,
  message_id   text NOT NULL,
  from_address text NOT NULL,
  subject      text NOT NULL DEFAULT '',
  status       text NOT NULL CHECK (status IN ('mottatt', 'avvist')),
  reason       text,
  skipped      text[] NOT NULL DEFAULT '{}',
  received_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, message_id)
);
CREATE TRIGGER inbound_email_immutable BEFORE UPDATE OR DELETE ON inbound_email
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE INDEX inbound_email_company_idx ON inbound_email (company_id, received_at DESC);

-- Hvilke arkivdokumenter som kom fra hvilken e-post.
CREATE TABLE inbound_email_document (
  email_id    int NOT NULL REFERENCES inbound_email(id),
  document_id uuid NOT NULL REFERENCES document(id) UNIQUE,
  PRIMARY KEY (email_id, document_id)
);
CREATE TRIGGER inbound_email_document_immutable BEFORE UPDATE OR DELETE ON inbound_email_document
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
