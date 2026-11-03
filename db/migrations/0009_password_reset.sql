-- «Glemt passord»: engangslenker for å sette nytt passord. Bare hash av tokenet lagres.
CREATE TABLE password_reset (
  id         serial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES app_user(id),
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_user_idx ON password_reset (user_id, created_at);
