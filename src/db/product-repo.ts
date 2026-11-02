import type postgres from "postgres";
import type { VatCategory } from "@/lib/vat";

export interface ProductRow {
  id: number;
  product_no: string;
  name: string;
  description: string | null;
  unit: string;
  price_ore: string;
  vat_category: VatCategory;
  revenue_account: string;
  active: boolean;
}

export async function listProducts(sql: postgres.Sql, companyId: number, opts: { onlyActive?: boolean } = {}) {
  return sql<ProductRow[]>`
    SELECT id, product_no, name, description, unit, price_ore::text, vat_category, revenue_account, active
    FROM product WHERE company_id = ${companyId} ${opts.onlyActive ? sql`AND active` : sql``}
    ORDER BY active DESC, name`;
}

export interface ProductInput {
  product_no: string;
  name: string;
  description: string | null;
  unit: string;
  price_ore: number;
  vat_category: VatCategory;
  revenue_account: string;
}

export function validateProduct(p: ProductInput): string[] {
  const e: string[] = [];
  if (!p.name.trim()) e.push("Navn mangler");
  if (!p.unit.trim()) e.push("Enhet mangler");
  if (!Number.isSafeInteger(p.price_ore) || p.price_ore < 0) e.push("Ugyldig pris");
  if (!["high", "medium", "low", "zero", "exempt"].includes(p.vat_category)) e.push("Ugyldig MVA-sats");
  if (!/^3\d{3}$/.test(p.revenue_account)) e.push("Inntektskontoen må være i 3000-serien");
  if (p.product_no && !/^[\w.-]{1,30}$/.test(p.product_no)) e.push("Varenummer kan bare inneholde bokstaver, tall, punktum og bindestrek");
  return e;
}

export async function saveProduct(sql: postgres.Sql, companyId: number, p: ProductInput, id?: number, active = true) {
  return sql.begin(async (tx) => {
    let productNo = p.product_no.trim();
    if (!productNo) {
      const [{ next }] = await tx<{ next: number }[]>`
        SELECT coalesce(max(CASE WHEN product_no ~ '^[0-9]{1,9}$' THEN product_no::int END), 1000) + 1 AS next
        FROM product WHERE company_id = ${companyId}`;
      productNo = String(next);
    }
    const dup = await tx`SELECT id FROM product WHERE company_id = ${companyId} AND product_no = ${productNo} AND id <> ${id ?? 0}`;
    if (dup.length) throw new Error(`Varenummer ${productNo} er allerede i bruk`);
    const acc = await tx`SELECT 1 FROM account WHERE company_id = ${companyId} AND number = ${p.revenue_account}`;
    if (!acc.length) throw new Error(`Konto ${p.revenue_account} finnes ikke i kontoplanen`);
    if (id) {
      const rows = await tx`UPDATE product SET product_no = ${productNo}, name = ${p.name.trim()}, description = ${p.description},
          unit = ${p.unit.trim()}, price_ore = ${p.price_ore}, vat_category = ${p.vat_category},
          revenue_account = ${p.revenue_account}, active = ${active}
        WHERE id = ${id} AND company_id = ${companyId} RETURNING id`;
      if (!rows.length) throw new Error("Fant ikke varen");
      return id;
    }
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO product (company_id, product_no, name, description, unit, price_ore, vat_category, revenue_account)
      VALUES (${companyId}, ${productNo}, ${p.name.trim()}, ${p.description}, ${p.unit.trim()}, ${p.price_ore},
              ${p.vat_category}, ${p.revenue_account})
      RETURNING id`;
    return row.id;
  }) as Promise<number>;
}
