# Promotion Calculation Service

A TypeScript/Node.js backend that evaluates configured ecommerce promotions and returns an explainable calculation result.

## Requirements

- Node.js 20+
- npm
- Docker Desktop (for local PostgreSQL)

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Start PostgreSQL:

   ```bash
   npm run db:up
   ```

4. Create tables:

   ```bash
   npm run db:migrate
   ```

5. Start the API:

   ```bash
   npm run dev
   ```

Health check: `GET http://localhost:3000/health`

## Calculate promotions

`POST http://localhost:3000/api/v1/promotions/calculate`

Example request:

```json
{
  "customer": { "id": "customer-123", "tier": "GOLD" },
  "items": [
    { "sku": "SKU-BOOT-01", "quantity": 4, "unitPriceCents": 10000, "category": "footwear" }
  ],
  "cartSubtotalCents": 40000
}
```

All monetary amounts are integer cents. The subtotal must equal the sum of quantity multiplied by unit price for every line. The service rejects inconsistent totals.

## Test

```bash
npm test
npm run test:coverage
npm run build
```

## Configured examples

The service includes one instance of each required promotion:
- Buy 3 `SKU-BOOT-01`, get 1 `SKU-BOOT-01` free.
- Buy `SKU-JACKET-02` and `SKU-SCARF-05`, get `SKU-GLOVE-03` free.
- Buy 2 `SKU-SHOE-07`, get 30% off `SKU-SOCK-12`.
- Buy `SKU-CAMERA-01` and `SKU-LENS-04`, get $40 off `SKU-BAG-09`.

Promotion definitions are currently in `src/domain/promotions.ts`.

## Assumptions and limitations

- Currency is USD; amounts are integer cents.
- A percentage discount applies to one eligible target unit per qualifying trigger application.
- A fixed discount applies per eligible target unit, capped at that unit's price.
- Conflict resolution: promotions are evaluated by descending priority (then ID for deterministic ties). At most one promotion may discount a given target SKU. Trigger products may qualify multiple promotions; only discounted target SKUs are exclusive.
- For a same-SKU buy-X-get-X-free offer, qualifying units and reward units must be distinct. The current implementation supports one free reward unit per cart for this configured rule; repeated reward applications are a known extension point.
- Cart line items should contain one consolidated line per SKU. Duplicate-SKU line aggregation is a follow-up hardening task.
- Promotion configuration is code-defined for this assessment; a repository abstraction/configuration store can replace it later.
- Authentication/authorization is assumed to be provided by an upstream API gateway in the deployment environment. The local sample does not implement identity.
- Audit persistence is synchronous and fail-closed: a calculation is returned as successful only after its audit transaction commits.
- The cart subtotal is verified against line items to avoid trusting conflicting client totals.

## Project structure

```text
src/
  domain/       # Domain types and configured promotion definitions
  engine/       # Rule evaluation and conflict resolution
  http/         # Express routes and HTTP concerns
  validation/   # Ajv request schemas
  db/           # PostgreSQL pool, schema, migrations and audit repository
tests/          # Engine and API tests
```

## Important review notes

This is a focused assessment implementation, not a complete production deployment. Review `ARCHITECTURE.md`, `DECISIONS.md`, `PRODUCTION_READINESS.md`, and `AI_USAGE.md` before submission. In particular, inspect the promotion-engine assumptions and add edge-case tests before treating the result as production-ready.
