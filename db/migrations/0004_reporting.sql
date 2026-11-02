-- Kontoer som MVA-oppgjør og årsrapporter bruker, for firma opprettet før kontoplanen ble utvidet.
INSERT INTO account (company_id, number, name)
SELECT c.id, v.number, v.name FROM company c
CROSS JOIN (VALUES ('2050', 'Annen egenkapital'), ('2740', 'Oppgjørskonto MVA')) AS v(number, name)
ON CONFLICT DO NOTHING;

-- Raskere oppslag av bilag per referanse (MVA-oppgjør, fakturaer).
CREATE INDEX IF NOT EXISTS journal_entry_ref_idx ON journal_entry (company_id, document_ref);
