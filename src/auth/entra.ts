import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Mock Microsoft Entra ID bearer check.
 * HS256 with a dev secret, all local. No JWKS and no network calls.
 */

const DEFAULT_SKEW_SECONDS = 60;

export interface EntraOptions {
  tenantId: string;
  audience: string;
  /** HMAC secret for dev-signed tokens. Production would verify Entra's JWKS. */
  secret: string;
  clockSkewSeconds?: number;
  now?: () => Date;
}

export interface Principal {
  subject: string;
  tenantId: string;
}

export type AuthFailure =
  | "missing_bearer"
  | "invalid_token"
  | "token_expired"
  | "token_not_yet_valid"
  | "wrong_issuer"
  | "wrong_tenant"
  | "wrong_audience";

export type AuthResult = { ok: true; principal: Principal } | { ok: false; error: AuthFailure };

export interface DevClaims {
  iss: string;
  aud?: string | string[];
  exp: number;
  nbf?: number;
  tid: string;
  sub: string;
}

export function expectedIssuers(tenantId: string): readonly string[] {
  return [
    `https://login.microsoftonline.com/${tenantId}/v2.0`,
    `https://sts.windows.net/${tenantId}/`,
  ];
}

export function signDevToken(claims: DevClaims, secret: string): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode(claims);
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

export function requireEntraAuth(options: EntraOptions): RequestHandler {
  return (req, res, next) => {
    const result = authenticate(req.header("authorization"), options);
    if (!result.ok) {
      res.status(401).json({ error: result.error });
      return;
    }
    res.locals.principal = result.principal;
    next();
  };
}

export function authenticate(header: string | undefined, options: EntraOptions): AuthResult {
  if (header === undefined || header.trim() === "") {
    return { ok: false, error: "missing_bearer" };
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header.trim());
  if (!match?.[1]) {
    return { ok: false, error: "invalid_token" };
  }
  return validateToken(match[1], options);
}

function validateToken(token: string, options: EntraOptions): AuthResult {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "invalid_token" };
  }
  const [headerPart, payloadPart, signaturePart] = parts;
  if (headerPart === undefined || payloadPart === undefined || !signaturePart) {
    return { ok: false, error: "invalid_token" };
  }

  const header = decode(headerPart);
  if (!isRecord(header) || header.alg !== "HS256") {
    return { ok: false, error: "invalid_token" };
  }
  if (!safeEqual(signaturePart, sign(`${headerPart}.${payloadPart}`, options.secret))) {
    return { ok: false, error: "invalid_token" };
  }

  const payload = decode(payloadPart);
  if (!isRecord(payload)) {
    return { ok: false, error: "invalid_token" };
  }

  const { exp, sub, tid, iss } = payload;
  if (typeof exp !== "number" || typeof sub !== "string" || sub === "") {
    return { ok: false, error: "invalid_token" };
  }
  if (typeof tid !== "string" || typeof iss !== "string") {
    return { ok: false, error: "invalid_token" };
  }

  const now = Math.floor((options.now?.() ?? new Date()).getTime() / 1000);
  const skew = options.clockSkewSeconds ?? DEFAULT_SKEW_SECONDS;
  if (now > exp + skew) {
    return { ok: false, error: "token_expired" };
  }
  if (typeof payload.nbf === "number" && now + skew < payload.nbf) {
    return { ok: false, error: "token_not_yet_valid" };
  }
  if (!expectedIssuers(options.tenantId).includes(iss)) {
    return { ok: false, error: "wrong_issuer" };
  }
  if (tid !== options.tenantId) {
    return { ok: false, error: "wrong_tenant" };
  }
  if (!audienceAccepted(payload.aud, options.audience)) {
    return { ok: false, error: "wrong_audience" };
  }

  return { ok: true, principal: { subject: sub, tenantId: tid } };
}

function audienceAccepted(audience: unknown, expected: string): boolean {
  // Entra v1 tokens for some confidential clients omit `aud` and identify
  // the API only via `appid`. A missing audience is not treated as a mismatch.
  if (audience === undefined) {
    return true;
  }
  const values = Array.isArray(audience) ? audience : [audience];
  return values.some((value) => value === expected);
}

function sign(content: string, secret: string): string {
  return createHmac("sha256", secret).update(content).digest("base64url");
}

function safeEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
