# QuickStore: multi-tenant e-commerce webapp builder

A restaurant, shop or service business signs up, picks a template, and has a branded ordering
website live in minutes. One codebase serves every store; each store's look, menu and features come
from its configuration in MongoDB.

This repository implements **Phase 0 (Foundations) + Phase 1 (Restaurant MVP)** of the product &
technical plan: tenant isolation, hostname routing, theme engine, site builder with live preview,
catalogue with add-ons, delivery + pickup, COD checkout, live order board, publish/versioning,
and Super Admin basics.

| App | Port (dev) | Who uses it | Path |
| --- | --- | --- | --- |
| **Storefront** (Next.js) | 3000 | Customers, at `<slug>.<ROOT_DOMAIN>` | `apps/storefront` |
| **Tenant Admin** (Next.js) | 3001 | Store owners & staff | `apps/tenant-admin` |
| **Super Admin** (Next.js) | 3002 | Platform team (2FA required) | `apps/super-admin` |
| **API** (Express + TypeScript + Mongoose) | 4000 | All three apps (server-side only) | `apps/api` |

```
Browser ──► Next.js server (BFF, httpOnly cookies) ──► API ──► MongoDB Atlas
                                                       └──► event bus ──► notifications, cache purge
```

Browsers never talk to the API or the database directly. Each Next.js app proxies a fixed set of calls
server-side.

## Run it locally

Requirements: Node 20.11+, and MongoDB (your Atlas cluster, or `docker compose up -d` for a local one).

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create the root `.env` from `.env.example` (`MONGODB_URI`, `JWT_SECRET`, `ROOT_DOMAIN=localhost`,
   `REVALIDATE_SECRET`). For each app, copy `apps/<app>/.env.example` to `apps/<app>/.env.local`; the
   defaults work for local development.
3. Check the database and create collections and indexes:
   ```bash
   npm run db:check
   ```
   ```bash
   npm run db:indexes
   ```
4. Optional: seed a published demo store and create a Super Admin account:
   ```bash
   npm run seed:demo
   ```
   ```bash
   npm run platform:admin -- you@company.com "Your Name" owner
   ```
   The second command prints a one-time password and a 2FA key. Add the key to an authenticator app.
5. Start each app in its own terminal:
   ```bash
   npm run dev:api
   ```
   ```bash
   npm run dev:storefront
   ```
   ```bash
   npm run dev:admin
   ```
   ```bash
   npm run dev:ops
   ```

Then open:
- Sign up a new store: http://localhost:3001/signup
- Demo store: http://pizza-point.localhost:3000 (admin: store `pizza-point`, `demo@example.com` / `demo-password-123`)
- Super Admin: http://localhost:3002

Chrome and Firefox resolve `*.localhost` to your machine automatically, so every store gets its own subdomain locally.

## What's included

**Storefront.** Hostname → tenant routing; theme tokens become CSS variables (colours, curated font
pairs, radius, button style, custom CSS); section registry (hero, announcement, category strip,
featured items, menu grid, about, branches, text). Also: menu with sticky category tabs, scroll-spy and
search; item modal with add-on rules (min/max) and live price; slide-in cart; one-page checkout with
delivery/pickup, branch choice and a server-side quote; COD orders with idempotency keys; tracking page
with a status timeline; per-tenant `robots.txt`, `sitemap.xml` and JSON-LD; mobile-first; branded
"store not available" page.

**Tenant Admin.**
- **Signup and setup:** an 8-step setup. Business name/type/address, template and account come first;
  then brand, features, location & hours, menu and publish. Every step has defaults.
- **Daily operations:**
  - Dashboard (today's sales, live orders, 7-day chart, top items, plan usage, setup checklist).
  - Live order board over Server-Sent Events, with sound alerts, accept/reject with a reason, status
    flow and thermal-receipt printing.
  - CSV export.
- **Store management:** menu manager (items, categories with ordering, add-on groups, stock, sold-out
  toggle); branches with opening hours, delivery fee, minimum order, radius and prep time; customers;
  staff and roles; store settings.
- **Website builder:**
  - Settings panel beside the real storefront in an iframe; edits show instantly via `postMessage`
    and autosave to the draft.
  - Undo/redo; click a section in the preview to edit it; desktop/tablet/mobile views.
  - Reset to a template, and a shareable 7-day preview link.
- **Features and publishing:**
  - Feature toggles that follow dependency and plan rules.
  - Publish with a readiness checklist, then copy or WhatsApp-share the live URL.
  - Version history with one-click rollback.

**Super Admin.** Password + mandatory TOTP 2FA on a separate origin with separate cookies. Overview
(tenants by status, sign-ups, 24h orders/GMV, MRR, stores stuck in draft); tenant search and detail
(usage, domains, audit trail); suspend/reactivate with a reason (revokes staff sessions and purges the
storefront cache); plan changes; trial extension; plan & limit editor; platform audit log. Actions are
gated by role (owner / support / finance).

## Security model

- **Tenant isolation in the data layer.** A Mongoose plugin adds a required, immutable `tenantId` to
  every tenant collection. It injects `tenantId` into every find/update/delete/count and aggregate
  (including `$lookup`), and throws if a query runs without a tenant context. The tenant comes only from
  a verified token or the request hostname, never from request bodies. Every tenant index starts with
  `tenantId`.
- **Prices are always computed on the server.** Strict Zod schemas reject unknown fields, including
  `tenantId` and client-supplied prices.
- **Auth.**
  - Staff: scrypt-hashed passwords, 15-minute access tokens, and rotating refresh tokens. Reusing an old
    refresh token revokes the whole login session.
  - Platform staff: also need TOTP and can have an IP allow-list.
  - Tokens are stored only in httpOnly cookies. Writes require a same-origin check and a CSRF header.
- **Abuse protection.** Rate limits on login, signup, quotes and orders. Order tracking needs a secret
  code in the link, so order IDs can't be guessed. Custom CSS is sanitised. The CSV export is guarded
  against spreadsheet formula injection. Audit log records sensitive actions.

## Tests

```bash
docker run -d -p 127.0.0.1:27017:27017 mongo:7.0
```
```bash
MONGODB_TEST_URI=mongodb://127.0.0.1:27017 npm test
```

There are 33 API tests. They cover:
- cross-tenant reads and writes (they return 404), operator injection, and `$lookup` scoping;
- signup → publish → order → fulfilment, server-side pricing, idempotency, and stock under concurrent
  orders;
- plan limits, feature dependencies, staff roles, refresh-token reuse detection;
- Super Admin TOTP login and suspension, plus RFC 6238 TOTP test vectors.

Without `MONGODB_TEST_URI`, the tests download an in-memory MongoDB instead. CI
(`.github/workflows/ci.yml`) runs type-checks, the tests and production builds of all three Next.js apps.

## Production notes

- Point `*.ROOT_DOMAIN` (wildcard DNS + TLS, e.g. Cloudflare) at the storefront. The admin and ops apps
  go on their own domains.
- Set `NODE_ENV=production`. Secure cookies and HSTS are already set.
- Run `npm run db:indexes` on each deploy (auto-indexing is off in production).
- The event bus and rate limiter run in-process in v1. Move them to Redis/BullMQ before running more
  than one API container (plan §11–12). Event names and payloads are already stable for that swap.

## Not built yet (later phases of the plan)

Online payments and gateway webhooks, custom domains, coupons, customer accounts / OTP login, delivery
zones drawn as polygons, kitchen display, riders and live map, loyalty, reviews, reservations,
WhatsApp/SMS providers (notifications currently log to the console behind a `Notifier` interface),
image upload (image URLs for now), AI menu import, subscription billing, Urdu UI. These features appear
in the admin as "Coming soon", and the plan already describes where each one plugs in.
