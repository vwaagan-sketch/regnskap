-- Lønn: ansatte, lønnskjøringer, lønnsslipper, utbetalinger og a-meldinger.
-- Godkjente lønnskjøringer er uforanderlige. Feil rettes med reversering eller en ny korreksjonskjøring.

CREATE TABLE payroll_settings (
  company_id           int PRIMARY KEY REFERENCES company(id),
  business_unit_org_no char(9) NOT NULL,
  aga_zone             text NOT NULL CHECK (aga_zone IN ('1','2','3','4','5')),
  holiday_pay_rate_bp  int NOT NULL DEFAULT 1020 CHECK (holiday_pay_rate_bp IN (1020, 1200)),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE employee (
  id                 serial PRIMARY KEY,
  company_id         int NOT NULL REFERENCES company(id),
  employee_no        int NOT NULL,
  name               text NOT NULL,
  national_id        char(11) NOT NULL,
  email              text,
  address            text NOT NULL,
  postal_code        text NOT NULL,
  city               text NOT NULL,
  bank_account       char(11),
  employment_id      text NOT NULL,
  start_date         date NOT NULL,
  end_date           date,
  occupation_code    char(7) NOT NULL,
  position_pct       numeric(5,2) NOT NULL CHECK (position_pct > 0 AND position_pct <= 100),
  hours_per_week     numeric(4,2) NOT NULL DEFAULT 37.5 CHECK (hours_per_week > 0),
  pay_type           text NOT NULL CHECK (pay_type IN ('fast','time')),
  monthly_salary_ore bigint CHECK (monthly_salary_ore > 0),
  hourly_rate_ore    bigint CHECK (hourly_rate_ore > 0),
  tax_percent        int NOT NULL CHECK (tax_percent BETWEEN 0 AND 100),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_no),
  UNIQUE (company_id, national_id)
);

CREATE TABLE payroll_run (
  id              serial PRIMARY KEY,
  company_id      int NOT NULL REFERENCES company(id),
  run_no          int NOT NULL,
  pay_date        date NOT NULL,
  description     text NOT NULL,
  reverses_run_id int UNIQUE REFERENCES payroll_run(id),
  entry_id        bigint NOT NULL REFERENCES journal_entry(id),
  gross_ore       bigint NOT NULL,
  tax_ore         bigint NOT NULL,
  net_ore         bigint NOT NULL,
  aga_ore         bigint NOT NULL,
  holiday_pay_ore bigint NOT NULL,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, run_no)
);

CREATE TABLE payslip (
  id                   serial PRIMARY KEY,
  run_id               int NOT NULL REFERENCES payroll_run(id),
  company_id           int NOT NULL REFERENCES company(id),
  employee_id          int NOT NULL REFERENCES employee(id),
  employee_snapshot    jsonb NOT NULL,   -- ansattopplysninger slik de var ved kjøringen
  tax_mode             text NOT NULL CHECK (tax_mode IN ('percent','manual')),
  tax_percent          int,
  gross_ore            bigint NOT NULL,
  tax_ore              bigint NOT NULL,
  net_ore              bigint NOT NULL,
  aga_basis_ore        bigint NOT NULL,  -- lønn og utbetalte feriepenger
  aga_ore              bigint NOT NULL,
  holiday_basis_ore    bigint NOT NULL,
  holiday_pay_ore      bigint NOT NULL,
  holiday_aga_ore      bigint NOT NULL,
  UNIQUE (run_id, employee_id)
);

CREATE TABLE payslip_line (
  id          serial PRIMARY KEY,
  payslip_id  int NOT NULL REFERENCES payslip(id),
  type        text NOT NULL CHECK (type IN ('fastloenn','timeloenn','overtid','bonus','feriepenger','trekkFerie')),
  description text,
  quantity    numeric(10,2) NOT NULL,
  rate_ore    bigint NOT NULL,
  amount_ore  bigint NOT NULL
);

CREATE TABLE payroll_payment (
  id          serial PRIMARY KEY,
  company_id  int NOT NULL REFERENCES company(id),
  run_id      int NOT NULL UNIQUE REFERENCES payroll_run(id),
  paid_date   date NOT NULL,
  entry_id    bigint NOT NULL REFERENCES journal_entry(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Hver generert a-melding lagres slik den ble laget. En ny versjon erstatter forrige for samme måned.
CREATE TABLE a_melding (
  id                 serial PRIMARY KEY,
  company_id         int NOT NULL REFERENCES company(id),
  period             char(7) NOT NULL,
  melding_id         uuid NOT NULL UNIQUE,
  replaces_melding_id uuid REFERENCES a_melding(melding_id),
  sum_tax_ore        bigint NOT NULL,
  sum_aga_ore        bigint NOT NULL,
  xml                text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER payroll_run_immutable BEFORE UPDATE OR DELETE ON payroll_run
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER payslip_immutable BEFORE UPDATE OR DELETE ON payslip
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER payslip_line_immutable BEFORE UPDATE OR DELETE ON payslip_line
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER payroll_payment_immutable BEFORE UPDATE OR DELETE ON payroll_payment
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER a_melding_immutable BEFORE UPDATE OR DELETE ON a_melding
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE INDEX payroll_run_date_idx ON payroll_run (company_id, pay_date);
CREATE INDEX payslip_employee_idx ON payslip (employee_id);
CREATE INDEX a_melding_period_idx ON a_melding (company_id, period);

-- Lønnskontoer (NS 4102) for firma som allerede er registrert.
INSERT INTO account (company_id, number, name)
SELECT c.id, v.number, v.name
FROM company c, (VALUES
  ('1950', 'Bankinnskudd for skattetrekk'),
  ('2600', 'Forskuddstrekk'),
  ('2770', 'Skyldig arbeidsgiveravgift'),
  ('2785', 'Påløpt arbeidsgiveravgift på feriepenger'),
  ('2930', 'Skyldig lønn'),
  ('2940', 'Skyldig feriepenger'),
  ('5000', 'Lønn til ansatte'),
  ('5180', 'Feriepenger'),
  ('5400', 'Arbeidsgiveravgift'),
  ('5405', 'Arbeidsgiveravgift på påløpte feriepenger')
) AS v(number, name)
ON CONFLICT DO NOTHING;
