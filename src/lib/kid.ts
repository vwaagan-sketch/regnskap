/** KID-nummer med MOD10-kontrollsiffer (Luhn), som brukt av norske banker. */
export function mod10CheckDigit(base: string): string {
  if (!/^\d+$/.test(base)) throw new Error("KID-grunnlag må være sifre");
  let sum = 0;
  let double = true;
  for (let i = base.length - 1; i >= 0; i--) {
    let d = Number(base[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return String((10 - (sum % 10)) % 10);
}

export function makeKid(customerNo: number, invoiceNo: number): string {
  const base = `${String(customerNo).padStart(5, "0")}${String(invoiceNo).padStart(7, "0")}`;
  return base + mod10CheckDigit(base);
}

export function isValidKid(kid: string): boolean {
  return /^\d{2,25}$/.test(kid) && mod10CheckDigit(kid.slice(0, -1)) === kid.slice(-1);
}
