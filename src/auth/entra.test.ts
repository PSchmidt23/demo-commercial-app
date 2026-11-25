import { describe, expect, it } from "vitest";
import {
  authenticate,
  expectedIssuers,
  signDevToken,
  type DevClaims,
  type EntraOptions,
} from "./entra.js";

const TENANT = "22222222-2222-2222-2222-222222222222";
const AUDIENCE = "api://northstar-dataroom";
const SECRET = "test-secret";
const NOW = new Date("2026-06-01T12:00:00Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const ISSUER = expectedIssuers(TENANT)[0] ?? "";

function options(overrides: Partial<EntraOptions> = {}): EntraOptions {
  return {
    tenantId: TENANT,
    audience: AUDIENCE,
    secret: SECRET,
    now: () => NOW,
    clockSkewSeconds: 60,
    ...overrides,
  };
}

function claims(overrides: Partial<DevClaims> = {}): DevClaims {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    exp: NOW_SECONDS + 3600,
    tid: TENANT,
    sub: "user-1",
    ...overrides,
  };
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

describe("authenticate", () => {
  it("accepts a token for this tenant, audience, and issuer", () => {
    const result = authenticate(bearer(signDevToken(claims(), SECRET)), options());

    expect(result).toEqual({ ok: true, principal: { subject: "user-1", tenantId: TENANT } });
  });

  it("accepts the v1 sts.windows.net issuer", () => {
    const token = signDevToken(
      claims({ iss: `https://sts.windows.net/${TENANT}/` }),
      SECRET,
    );
    expect(authenticate(bearer(token), options()).ok).toBe(true);
  });

  it("accepts an audience array that includes this API", () => {
    const token = signDevToken(claims({ aud: ["api://other", AUDIENCE] }), SECRET);
    expect(authenticate(bearer(token), options()).ok).toBe(true);
  });

  it("rejects a token minted for a different API", () => {
    const token = signDevToken(claims({ aud: "api://other-app" }), SECRET);
    expect(authenticate(bearer(token), options())).toEqual({ ok: false, error: "wrong_audience" });
  });

  it("rejects an expired token outside the clock skew", () => {
    const token = signDevToken(claims({ exp: NOW_SECONDS - 120 }), SECRET);
    expect(authenticate(bearer(token), options())).toEqual({ ok: false, error: "token_expired" });
  });

  it("allows a token that expired inside the clock skew", () => {
    const token = signDevToken(claims({ exp: NOW_SECONDS - 30 }), SECRET);
    expect(authenticate(bearer(token), options()).ok).toBe(true);
  });

  it("rejects a token that is not valid yet", () => {
    const token = signDevToken(claims({ nbf: NOW_SECONDS + 120 }), SECRET);
    expect(authenticate(bearer(token), options())).toEqual({
      ok: false,
      error: "token_not_yet_valid",
    });
  });

  it("rejects the wrong tenant", () => {
    const token = signDevToken(claims({ tid: "33333333-3333-3333-3333-333333333333" }), SECRET);
    expect(authenticate(bearer(token), options())).toEqual({ ok: false, error: "wrong_tenant" });
  });

  it("rejects the wrong issuer", () => {
    const token = signDevToken(claims({ iss: "https://login.example.com/v2.0" }), SECRET);
    expect(authenticate(bearer(token), options())).toEqual({ ok: false, error: "wrong_issuer" });
  });

  it("rejects a tampered payload", () => {
    const [header, payload, signature] = signDevToken(claims(), SECRET).split(".");
    const flipped = `${payload?.startsWith("a") ? "b" : "a"}${payload?.slice(1) ?? ""}`;
    const tampered = `${header}.${flipped}.${signature}`;
    expect(authenticate(bearer(tampered), options())).toEqual({ ok: false, error: "invalid_token" });
  });

  it("rejects alg none", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims())).toString("base64url");
    expect(authenticate(bearer(`${header}.${payload}.`), options())).toEqual({
      ok: false,
      error: "invalid_token",
    });
  });

  it("rejects a missing bearer header", () => {
    expect(authenticate(undefined, options())).toEqual({ ok: false, error: "missing_bearer" });
  });
});
