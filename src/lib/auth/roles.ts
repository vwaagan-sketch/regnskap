/** Roller i et firma. Hver rolle har alle rettighetene til rollene under seg. */
export const ROLES = ["admin", "regnskap", "lese"] as const;
export type Role = (typeof ROLES)[number];

/** Hva brukeren skal gjøre: lese data, føre bilag/fakturere, eller administrere firma og brukere. */
export type Access = "lese" | "skriv" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  regnskap: "Regnskapsfører",
  lese: "Kun lesetilgang",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Alt, også firmaopplysninger og brukere",
  regnskap: "Føre bilag, fakturere og registrere kunder og varer",
  lese: "Se regnskap, fakturaer og arkiv, men ikke endre noe",
};

const LEVEL: Record<Role, number> = { lese: 1, regnskap: 2, admin: 3 };
const NEEDED: Record<Access, number> = { lese: 1, skriv: 2, admin: 3 };

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function can(role: Role | null | undefined, access: Access): boolean {
  return role ? LEVEL[role] >= NEEDED[access] : false;
}

export const NO_ACCESS_MESSAGE: Record<Access, string> = {
  lese: "Du har ikke tilgang til dette firmaet",
  skriv: "Du har bare lesetilgang i dette firmaet",
  admin: "Bare administratorer i firmaet kan gjøre dette",
};
