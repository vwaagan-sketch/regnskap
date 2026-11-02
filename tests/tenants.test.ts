import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/auth/password";
import { can } from "@/lib/auth/roles";
import { safeNext } from "@/lib/auth/session";
import type { CompanyInput } from "@/db/company-repo";
import { createCustomer, issueInvoice, listCustomers, listInvoices } from "@/db/invoice-repo";
import { getCompanyById } from "@/db/company-repo";
import { getDocument, storeDocument } from "@/db/document-repo";
import { insertEntry } from "@/db/ledger-repo";
import {
  acceptInvitation, addCompanyForUser, authenticate, bootstrapFirstUser, createInvitation, createSession, getInvitation,
  listMembers, loadSession, registerCompanyWithAdmin, switchSessionCompany, updateMember,
} from "@/db/user-repo";

describe("passord og roller", () => {
  it("hasher og verifiserer passord", async () => {
    const h = await hashPassword("riktig-hest-batteri");
    expect(h).not.toContain("riktig");
    expect(await verifyPassword("riktig-hest-batteri", h)).toBe(true);
    expect(await verifyPassword("feil-passord", h)).toBe(false);
    expect(await verifyPassword("x", "tull")).toBe(false);
    expect(validatePassword("kort")).toMatch(/minst/);
  });

  it("gir hver rolle riktig tilgang", () => {
    expect(can("admin", "admin")).toBe(true);
    expect(can("regnskap", "skriv")).toBe(true);
    expect(can("regnskap", "admin")).toBe(false);
    expect(can("lese", "lese")).toBe(true);
    expect(can("lese", "skriv")).toBe(false);
    expect(can(null, "lese")).toBe(false);
  });

  it("videresender bare til interne stier", () => {
    expect(safeNext("/fakturaer")).toBe("/fakturaer");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
  });
});

const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("flere firma og brukere (krever DATABASE_URL)", () => {
  const sql = postgres(url ?? "", { onnotice: () => {} });
  const tag = Math.random().toString(36).slice(2, 8);
  const orgNo = () => String(100000000 + Math.floor(Math.random() * 899999999));
  const companyInput = (name: string): CompanyInput => ({
    name, org_no: orgNo(), address: "Gate 1", postal_code: "0150", city: "Oslo",
    vat_registered: true, in_business_register: true, bank_account: "12345678903",
  });
  const pw = "et-langt-passord";
  let a: { userId: number; companyId: number };
  let b: { userId: number; companyId: number };

  beforeAll(async () => {
    a = await registerCompanyWithAdmin(sql, { name: "Anne A", email: `anne-${tag}@a.no`, password: pw }, companyInput("A AS"));
    b = await registerCompanyWithAdmin(sql, { name: "Bjørn B", email: `bjorn-${tag}@b.no`, password: pw }, companyInput("B AS"));
  });
  afterAll(() => sql.end());

  it("registrerer firma med administrator og logger inn i riktig firma", async () => {
    expect(await authenticate(sql, `ANNE-${tag}@a.no`, pw)).toMatchObject({ id: a.userId });
    expect(await authenticate(sql, `anne-${tag}@a.no`, "feil")).toBeNull();
    const s = await loadSession(sql, await createSession(sql, a.userId));
    expect(s).toMatchObject({ company: { id: a.companyId }, role: "admin" });
  });

  it("nekter dobbel registrering av samme e-post og organisasjonsnummer", async () => {
    await expect(
      registerCompanyWithAdmin(sql, { name: "X", email: `anne-${tag}@a.no`, password: pw }, companyInput("X AS")),
    ).rejects.toThrow(/allerede registrert/);
    const existing = (await getCompanyById(sql, a.companyId))!;
    await expect(
      registerCompanyWithAdmin(sql, { name: "Y", email: `y-${tag}@y.no`, password: pw }, { ...companyInput("Y AS"), org_no: existing.org_no }),
    ).rejects.toThrow(/organisasjonsnummeret er allerede registrert/);
  });

  it("holder data adskilt mellom firma", async () => {
    const companyA = (await getCompanyById(sql, a.companyId))!;
    const custA = await createCustomer(sql, a.companyId, { name: "Kunde A", org_no: null, email: null, address: "V 1", postal_code: "0150", city: "Oslo" });
    const custB = await createCustomer(sql, b.companyId, { name: "Kunde B", org_no: null, email: null, address: "V 1", postal_code: "0150", city: "Oslo" });
    await issueInvoice(sql, companyA, {
      customerId: custA, issueDate: "2026-11-01", dueDate: "2026-11-15", deliveryDate: "2026-11-01",
      lines: [{ description: "Arbeid", quantity: 1, unitPriceOre: 10000, vatCategory: "high" }],
    });
    // Firma A kan ikke fakturere kunden til firma B.
    await expect(issueInvoice(sql, companyA, {
      customerId: custB, issueDate: "2026-11-01", dueDate: "2026-11-15", deliveryDate: "2026-11-01",
      lines: [{ description: "Arbeid", quantity: 1, unitPriceOre: 10000, vatCategory: "high" }],
    })).rejects.toThrow(/Fant ikke kunden/);

    expect((await listCustomers(sql, b.companyId)).map((c) => c.name)).toEqual(["Kunde B"]);
    expect(await listInvoices(sql, b.companyId)).toHaveLength(0);
    expect(await listInvoices(sql, a.companyId)).toHaveLength(1);

    const docId = await sql.begin((tx) => storeDocument(tx, a.companyId, {
      kind: "pdf", content: Buffer.from("hemmelig"), mediaType: "application/pdf", documentDate: "2026-11-01",
    }));
    expect(await getDocument(sql, a.companyId, docId)).not.toBeNull();
    expect(await getDocument(sql, b.companyId, docId)).toBeNull();
  });

  it("databasen stopper kobling til et annet firmas data", async () => {
    const docA = await sql.begin((tx) => storeDocument(tx, a.companyId, {
      kind: "pdf", content: Buffer.from("x"), mediaType: "application/pdf", documentDate: "2026-11-01",
    }));
    const entry = {
      date: "2026-11-01", description: "Test", documentRef: "t",
      lines: [{ account: "1920", amount: 100 }, { account: "3000", amount: -100 }],
    };
    await expect(sql.begin((tx) => insertEntry(tx, b.companyId, entry, "test", docA))).rejects.toThrow(/annet firma/);
    const custB = (await listCustomers(sql, b.companyId))[0];
    await expect(sql`
      INSERT INTO invoice (company_id, kind, number, customer_id, issue_date, due_date, delivery_date, net_ore, vat_ore, gross_ore, snapshot)
      VALUES (${a.companyId}, 'invoice', 999, ${custB.id}, '2026-11-01', '2026-11-01', '2026-11-01', 0, 0, 0, '{}')`,
    ).rejects.toThrow(/annet firma/);
  });

  it("lar ikke brukere bytte til firma de ikke har tilgang til", async () => {
    const sessionA = await createSession(sql, a.userId);
    expect(await switchSessionCompany(sql, sessionA, a.userId, b.companyId)).toBe(false);
    expect((await loadSession(sql, sessionA))?.company?.id).toBe(a.companyId);
  });

  it("inviterer, godtar og styrer tilgang", async () => {
    const admin = { id: a.userId, email: `anne-${tag}@a.no`, name: "Anne A" };
    const token = await createInvitation(sql, a.companyId, admin, `Kari-${tag}@a.no`, "lese");
    expect(await getInvitation(sql, token)).toMatchObject({ company_id: a.companyId, role: "lese", user_exists: false });
    const kari = await acceptInvitation(sql, token, { name: "Kari", password: pw });
    expect(kari.companyId).toBe(a.companyId);
    await expect(acceptInvitation(sql, token, { name: "Kari", password: pw })).rejects.toThrow(/ugyldig, brukt eller utløpt/);

    const session = await createSession(sql, kari.userId);
    expect(await loadSession(sql, session)).toMatchObject({ company: { id: a.companyId }, role: "lese" });

    // Eksisterende bruker (Bjørn) inviteres til firma A og får to firma.
    const t2 = await createInvitation(sql, a.companyId, admin, `bjorn-${tag}@b.no`, "regnskap");
    expect((await getInvitation(sql, t2))?.user_exists).toBe(true);
    await expect(acceptInvitation(sql, t2, { userId: kari.userId })).rejects.toThrow(/gjelder/);
    await acceptInvitation(sql, t2, { userId: b.userId });
    const sessionB = await createSession(sql, b.userId);
    expect(await switchSessionCompany(sql, sessionB, b.userId, a.companyId)).toBe(true);
    expect(await loadSession(sql, sessionB)).toMatchObject({ company: { id: a.companyId }, role: "regnskap" });

    // Deaktivert bruker mister tilgangen med en gang.
    await updateMember(sql, a.companyId, admin, kari.userId, { role: "lese", active: false });
    expect(await loadSession(sql, session)).toMatchObject({ company: null, role: null });
    expect((await listMembers(sql, a.companyId)).find((m) => m.user_id === kari.userId)?.active).toBe(false);
  });

  it("firmaet beholder alltid minst én administrator", async () => {
    const admin = { id: a.userId, email: `anne-${tag}@a.no`, name: "Anne A" };
    await expect(updateMember(sql, a.companyId, admin, a.userId, { role: "lese", active: true })).rejects.toThrow(/egen rolle/);
    const bjorn = { id: b.userId, email: `bjorn-${tag}@b.no`, name: "Bjørn B" };
    // Bjørn er regnskapsfører i A og kan ikke fjerne Anne (håndheves også i appen via rolle), men sperren i repoet gjelder uansett.
    await expect(updateMember(sql, a.companyId, bjorn, a.userId, { role: "regnskap", active: true })).rejects.toThrow(/minst én aktiv administrator/);
  });

  it("en bruker kan opprette flere firma", async () => {
    const user = { id: a.userId, email: `anne-${tag}@a.no`, name: "Anne A" };
    const c2 = await addCompanyForUser(sql, user, companyInput("A2 AS"));
    const s = await createSession(sql, a.userId);
    expect(await switchSessionCompany(sql, s, a.userId, c2)).toBe(true);
    expect(await loadSession(sql, s)).toMatchObject({ company: { id: c2, name: "A2 AS" }, role: "admin" });
  });

  it("oppretter første bruker fra APP_USER/APP_PASSWORD bare når ingen brukere finnes", async () => {
    process.env.APP_USER = "vegard";
    process.env.APP_PASSWORD = "gammelt-passord";
    expect(await bootstrapFirstUser(sql, "vegard", "gammelt-passord")).toBeNull(); // brukere finnes allerede
    await sql`TRUNCATE app_user RESTART IDENTITY CASCADE`;
    expect(await bootstrapFirstUser(sql, "vegard", "feil")).toBeNull();
    const u = await bootstrapFirstUser(sql, "Vegard", "gammelt-passord");
    expect(u).toMatchObject({ email: "vegard" });
    expect(await authenticate(sql, "vegard", "gammelt-passord")).toMatchObject({ id: u!.id });
    const s = await loadSession(sql, await createSession(sql, u!.id));
    expect(s?.role).toBe("admin");
    delete process.env.APP_USER;
    delete process.env.APP_PASSWORD;
  });
});
