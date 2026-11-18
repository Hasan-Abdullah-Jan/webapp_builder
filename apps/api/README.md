# @quickstore/api — data layer

Node.js + TypeScript + Mongoose API backed by MongoDB Atlas. Follows the plan's
"shared database, shared collections, `tenantId` on every document" model (§4).

## Setup

1. Put the connection string in the repo-root `.env` as `MONGODB_URI` (see `.env.example`).
   `.env` is git-ignored; the API also reads `apps/api/.env` if present. Real env vars take precedence.
2. `npm install` (from the repo root)
3. `npm run db:check`: connect, ping, and list collections (read-only, credentials redacted).
4. `npm run db:indexes`: create collections and build/sync all indexes (run on each deploy).
5. `npm run dev:api`: start the API on `PORT` (default 4000). `GET /health` pings the DB.

## Tenant isolation

- `src/db/plugins/tenantScope.ts`: added to every tenant collection. It adds a required, immutable
  `tenantId`, injects it into every find/update/delete/count/distinct, prepends `$match` to
  aggregates (and scopes `$lookup`), stamps it on create, and **throws if no tenant context exists**.
- `src/db/tenantContext.ts`: the tenant comes from `AsyncLocalStorage`. It is set only by
  `requireStaff` (verified JWT) or `resolveStorefrontTenant` (Host → `domains`), never from request bodies.
  Cross-tenant work must use `runAsPlatform('<reason>', fn)` explicitly.
- Request bodies go through strict Zod schemas, so `tenantId`, `_id` and unknown keys are rejected.
  Other tenants' ids return 404, never 403.
- Every index on a tenant collection starts with `tenantId` (this is enforced by a test).

## Collections

Platform: `tenants`, `domains`. Tenant: `users`, `roles`, `siteConfigs`, `branches`, `categories`,
`products`, `customers`, `orders`, `counters`.

## Endpoints

`/v1/admin/{categories,products,branches,customers}` provide full CRUD with cursor pagination
(`?limit=&cursor=&q=`), `GET /v1/admin/orders[/:id]`, `PATCH /v1/admin/orders/:id/status`,
`GET|PATCH /v1/admin/site-config/draft`, `POST /v1/admin/site-config/publish` (`{fromVersion}` = rollback),
`GET /v1/admin/site-config/versions`, and `GET /v1/store/config` (by Host).

## Tests

`npm test` runs the cross-tenant isolation suite against an in-memory MongoDB. If the mongod
download is blocked, point it at a throwaway local server instead. The suite drops its test database:

    docker run -d --name qs-mongo-test -p 127.0.0.1:27017:27017 mongo:7.0
    MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
