import { pathToFileURL } from "node:url";
import express, { type Express } from "express";
import { requireEntraAuth, type EntraOptions } from "./auth/entra.js";
import { buildProposal, QuoteError } from "./proposals/calculator.js";

const DEV_TENANT = "11111111-1111-1111-1111-111111111111";
const DEV_AUDIENCE = "api://northstar-dataroom";
const DEV_SECRET = "dev-only-change-me";

export interface AppConfig {
  entra: EntraOptions;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    entra: {
      tenantId: env.ENTRA_TENANT_ID ?? DEV_TENANT,
      audience: env.ENTRA_AUDIENCE ?? DEV_AUDIENCE,
      secret: env.ENTRA_DEV_SECRET ?? DEV_SECRET,
    },
  };
}

export function createApp(config: AppConfig = configFromEnv()): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/quote", requireEntraAuth(config.entra), (req, res) => {
    try {
      res.json(buildProposal(req.body));
    } catch (error) {
      if (error instanceof QuoteError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  return app;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => {
    console.log(`northstar deal room listening on ${port}`);
  });
}
