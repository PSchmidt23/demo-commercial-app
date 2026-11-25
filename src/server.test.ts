import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { signDevToken } from "./auth/entra.js";
import { createApp, type AppConfig } from "./server.js";

const config: AppConfig = {
  entra: {
    tenantId: "11111111-1111-1111-1111-111111111111",
    audience: "api://northstar-dataroom",
    secret: "dev-only-change-me",
  },
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

async function start(): Promise<string> {
  const server = createApp(config).listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function token(): string {
  return signDevToken(
    {
      iss: `https://login.microsoftonline.com/${config.entra.tenantId}/v2.0`,
      aud: config.entra.audience,
      exp: Math.floor(Date.now() / 1000) + 600,
      tid: config.entra.tenantId,
      sub: "seller@contoso.com",
    },
    config.entra.secret,
  );
}

describe("routes", () => {
  it("reports health without a token", async () => {
    const base = await start();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("rejects a quote with no bearer token", async () => {
    const base = await start();
    const response = await fetch(`${base}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seats: 2, pages: 10, currency: "USD" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "missing_bearer" });
  });

  it("quotes a proposal for a valid token", async () => {
    const base = await start();
    const response = await fetch(`${base}/quote`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ seats: 2, pages: 10, currency: "GBP", discountRate: 0.05 }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { currency: string; total: number; totalUsd: number };
    expect(body.currency).toBe("GBP");
    expect(body.totalUsd).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThan(0);
  });

  it("returns 400 for a quote the calculator rejects", async () => {
    const base = await start();
    const response = await fetch(`${base}/quote`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({ seats: 0, pages: 10, currency: "USD" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "seats must be an integer from 1 to 100000",
    });
  });
});
