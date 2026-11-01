import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { postEntry } from "@/db/ledger-repo";
import { ACCOUNT_NAMES } from "@/lib/accounts";

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("database (krever DATABASE_URL)", () => {
  const sql = postgres(url ?? "", { onnotice: () => {} });
  let companyId = 0;

  beforeAll(async () => {
    const orgNo = String(100000000 + Math.floor(Math.random() * 899999999));
    [{ id: companyId }] = await sql<{ id: number }[]>`
      INSERT INTO company (name, org_no, address, postal_code, city, bank_account)
      VALUES ('Test AS', ${orgNo}, 'Gate 1', '0150', 'Oslo', '12345678903') RETURNING id`;
    for (const [no, name] of Object.entries(ACCOUNT_NAMES)) {
      await sql`INSERT INTO account (company_id, number, name) VALUES (${companyId}, ${no}, ${name})`;
    }
  });
  afterAll(() => sql.end());

  const entry = {
    date: "2026-11-01", description: "Kontantsalg", documentRef: "test:1",
    lines: [{ account: "1920", amount: 12500 }, { account: "3000", amount: -10000 }, { account: "2700", amount: -2500 }],
  };

  it("bokfører med fortløpende bilagsnummer", async () => {
    const a = await postEntry(sql, companyId, entry, "test");
    const b = await postEntry(sql, companyId, entry, "test");
    expect(b.voucherNo).toBe(a.voucherNo + 1);
  });

  it("nekter endring og sletting av posteringer", async () => {
    await expect(sql`UPDATE journal_line SET amount_ore = 1 WHERE company_id = ${companyId}`).rejects.toThrow(/uforanderlig/);
    await expect(sql`DELETE FROM journal_entry WHERE company_id = ${companyId}`).rejects.toThrow(/uforanderlig/);
  });

  it("databasen avviser ubalansert postering selv uten app-validering", async () => {
    await expect(
      sql.begin(async (tx) => {
        const [r] = await tx`INSERT INTO journal_entry (company_id, voucher_no, entry_date, description, document_ref, created_by)
          VALUES (${companyId}, 9999, '2026-11-01', 'x', 'x', 'test') RETURNING id`;
        await tx`INSERT INTO journal_line (entry_id, company_id, account, amount_ore) VALUES (${r.id}, ${companyId}, '1920', 100)`;
      }),
    ).rejects.toThrow(/balanserer ikke/);
  });
});
