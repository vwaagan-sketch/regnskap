import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken, checkCredentials, SESSION_TTL_SECONDS } from "@/lib/auth/session";

const secret = "x".repeat(40);

describe("innlogging", () => {
  it("godtar gyldig token og avviser manipulert eller utløpt", async () => {
    const t = await createSessionToken("vegard", secret);
    expect(await verifySessionToken(t, secret)).toBe("vegard");
    expect(await verifySessionToken(t.replace("vegard", "admin"), secret)).toBeNull();
    expect(await verifySessionToken(t, "y".repeat(40))).toBeNull();
    expect(await verifySessionToken(t, secret, Date.now() + (SESSION_TTL_SECONDS + 5) * 1000)).toBeNull();
    expect(await verifySessionToken(undefined, secret)).toBeNull();
  });

  it("sjekker brukernavn og passord", () => {
    process.env.APP_USER = "Vegard";
    process.env.APP_PASSWORD = "hemmelig-passord";
    expect(checkCredentials("vegard", "hemmelig-passord")).toBe(true);
    expect(checkCredentials("vegard", "feil")).toBe(false);
    delete process.env.APP_PASSWORD;
    expect(checkCredentials("vegard", "")).toBe(false);
  });
});
