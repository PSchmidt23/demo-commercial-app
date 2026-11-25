# Northstar Deal Room

Small B2B sample used as the target repo for the Release Unblocker demo. It prices a data-room proposal (platform fee, seats, hosted pages), converts the total into about ten currencies, and protects `POST /quote` with a mock Microsoft Entra ID bearer check. No live FX feed and no calls to Entra.

`main` is the green baseline. The failure branches below are not merged.

## Run

Node.js 22.

```bash
npm ci
npm test
npm start
```

- `GET /health` is open.
- `POST /quote` requires `Authorization: Bearer <token>`.

```bash
curl -s localhost:3000/health
```

```json
{ "seats": 4, "pages": 250, "currency": "EUR", "discountRate": 0.1 }
```

Dev defaults, overridden by `ENTRA_TENANT_ID`, `ENTRA_AUDIENCE`, and `ENTRA_DEV_SECRET`:

| Setting | Default |
| --- | --- |
| Tenant | `11111111-1111-1111-1111-111111111111` |
| Audience | `api://northstar-dataroom` |
| HMAC secret | `dev-only-change-me` |

`signDevToken` in `src/auth/entra.ts` mints a token for local calls. Tests show the claims.

Pricing: $500 platform, then the whole seat count at one tier ($180 / $140 / $110 / $80) and the whole page count at one tier ($0.25 / $0.15 / $0.08). Discounts up to 40% are taken in USD and rounded half-up to the cent. The net is converted once and rounded half-up to the quote currency's minor units (yen have none, dinars have three).

## Checks

```bash
npm run lint
npm run typecheck
npm test
```

The `CI` workflow runs `npm ci`, lint, `tsc --noEmit`, and tests on every push and pull request.

`src/auth/`, `migrations/`, and `infra/` are protected. See `PROTECTED_PATHS.md` and `.github/CODEOWNERS`.

## Demo scenarios

Planted for the 1 December interview. Do not merge the failure branches.

### A. `ci-fail-lint-type`

`src/pricing/currency.ts` has an unused `node:crypto` import and `parseRate` annotated as returning `number` while it still returns `{ num, den }`. Lint fails on the import. `npm run typecheck` fails on the return type. Tests still pass.

### B. `ci-fail-test`

`src/proposals/calculator.ts` converts the subtotal and then applies the discount in the quote currency, instead of discounting in USD and converting the net once. The Vitest case "converts the discounted USD total, then rounds half-up" fails (91834 JPY instead of 91833). Lint and typecheck still pass. The tests are unchanged.

### C. Security finding, on main

`fixtures/findings/cve-auth-bypass.json` is a high-severity SAST finding against `src/auth/entra.ts`. `audienceAccepted` returns success when `aud` is missing, so a token with no audience is accepted. Issuer, tenant, expiry, and signature are still enforced, and the existing tests stay green. `src/auth/` is a protected path, so a fix there needs a human reviewer.
