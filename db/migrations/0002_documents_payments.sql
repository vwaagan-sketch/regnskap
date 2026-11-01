-- Metadata for dokumentarkivet.
ALTER TABLE document ADD COLUMN filename text;
ALTER TABLE document ADD COLUMN title text;
ALTER TABLE document ADD COLUMN size_bytes int;
ALTER TABLE document ADD COLUMN document_date date;

-- Innholdet i originaldokumenter (bilder, PDF). Lagres i databasen inntil objektlager er på plass.
CREATE TABLE document_blob (
  document_id uuid PRIMARY KEY REFERENCES document(id),
  media_type  text NOT NULL,
  content     bytea NOT NULL
);
CREATE TRIGGER document_blob_immutable BEFORE UPDATE OR DELETE ON document_blob
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Kobling mellom postering og dokumentasjon (kontrollspor).
ALTER TABLE journal_entry ADD COLUMN document_id uuid REFERENCES document(id);

-- Innbetalinger på kundefakturaer.
CREATE TABLE invoice_payment (
  id          serial PRIMARY KEY,
  company_id  int NOT NULL REFERENCES company(id),
  invoice_id  int NOT NULL REFERENCES invoice(id),
  paid_date   date NOT NULL,
  amount_ore  bigint NOT NULL CHECK (amount_ore > 0),
  entry_id    bigint NOT NULL REFERENCES journal_entry(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER invoice_payment_immutable BEFORE UPDATE OR DELETE ON invoice_payment
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE INDEX journal_line_account_idx ON journal_line (company_id, account);
CREATE INDEX journal_entry_date_idx ON journal_entry (company_id, entry_date);
