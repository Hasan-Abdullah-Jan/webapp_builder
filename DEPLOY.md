# Deploying QuickStore on Vercel

QuickStore is four apps in one repository. On Vercel each one becomes its **own project**, all
connected to the same GitHub repo:

| Vercel project | Root Directory | What it is |
| --- | --- | --- |
| `quickstore-api` | `apps/api` | Backend (runs as a serverless function) |
| `quickstore-store` | `apps/storefront` | Customer websites |
| `quickstore-admin` | `apps/tenant-admin` | Store owner dashboard |
| `quickstore-ops` | `apps/super-admin` | Platform team console |

Deploy them **in this order**, because each one needs the previous one's URL.

---

## Before you start: MongoDB Atlas

1. **Network Access → Add IP Address → `0.0.0.0/0`.** Vercel's servers don't have fixed IP addresses,
   so Atlas has to accept connections from anywhere. Your database password then becomes the only
   protection, so make it a long random password that hasn't been shared anywhere.
2. Copy the connection string from **Database → Connect → Drivers**. Remove the `< >` around the
   username and password, and add the database name before the `?`, e.g.
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/website_builder?retryWrites=true&w=majority`.
   (On Vercel the short `mongodb+srv://` form works fine.)

Generate three secrets now. Run this three times and keep the outputs somewhere private:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

You'll use them as `JWT_SECRET` (API only) and `REVALIDATE_SECRET` (API **and** storefront, same value).
The third is spare.

---

## 1. API (`apps/api`)

**Add New → Project → Import** your GitHub repo, then:

- **Root Directory:** `apps/api`
- **Framework Preset:** Other. The build settings come from `apps/api/vercel.json`, so leave them as they are.

**Environment Variables:**

| Name | Value |
| --- | --- |
| `MONGODB_URI` | your Atlas connection string |
| `MONGODB_DB_NAME` | `website_builder` |
| `JWT_SECRET` | secret #1 |
| `NODE_ENV` | `production` |
| `ROOT_DOMAIN` | `stores.local` if you don't own a domain yet (see "Store addresses" below), otherwise your domain, e.g. `quickstore.pk` |
| `REVALIDATE_SECRET` | secret #2 |
| `STOREFRONT_REVALIDATE_URL` | *(fill in after step 2)* `https://<storefront-url>/api/revalidate` |

Deploy, then open `https://<api-url>/health`. You should see `{"status":"ok","db":{"ok":true,...}}`.
If it says `degraded`, check `MONGODB_URI` and the Atlas Network Access step.

---

## 2. Storefront (`apps/storefront`)

New project from the same repo:

- **Root Directory:** `apps/storefront`. Vercel detects Next.js automatically.

| Name | Value |
| --- | --- |
| `API_URL` | `https://<api-url>` (no trailing slash) |
| `STORE_ROOT_DOMAIN` | same value as `ROOT_DOMAIN` on the API |
| `REVALIDATE_SECRET` | secret #2 (same as the API) |
| `ADMIN_ORIGIN` | *(after step 3)* `https://<admin-url>` |
| `NEXT_PUBLIC_ADMIN_ORIGIN` | *(after step 3)* `https://<admin-url>` |

Then go back to the **API** project, set `STOREFRONT_REVALIDATE_URL` to
`https://<storefront-url>/api/revalidate`, and redeploy the API.

---

## 3. Store owner admin (`apps/tenant-admin`)

- **Root Directory:** `apps/tenant-admin`

| Name | Value |
| --- | --- |
| `API_URL` | `https://<api-url>` |
| `NEXT_PUBLIC_STOREFRONT_URL` | `https://<storefront-url>/s/{slug}`. Keep `{slug}` exactly as written. |

Then go back to the **storefront** project, set `ADMIN_ORIGIN` and `NEXT_PUBLIC_ADMIN_ORIGIN` to the
admin URL, and **redeploy the storefront**. `NEXT_PUBLIC_*` values are built into the page, so only
a redeploy picks them up. Without this the website-builder preview won't load.

---

## 4. Super Admin (`apps/super-admin`)

- **Root Directory:** `apps/super-admin`

| Name | Value |
| --- | --- |
| `API_URL` | `https://<api-url>` |
| `NEXT_PUBLIC_STOREFRONT_URL` | `https://<storefront-url>/s/{slug}` |

Create your Super Admin login **from your computer**, pointing at the production database. Put the
production `MONGODB_URI` in your local `.env`, then run each of these:

```bash
npm run db:indexes
```
```bash
npm run platform:admin -- you@yourcompany.com "Your Name" owner
```

The second command prints a password and a 2FA key once. Don't paste them anywhere.

---

## Store addresses: path-based vs your own domain

**Without a custom domain (works immediately):** every store lives under the storefront's Vercel
address, e.g. `https://quickstore-store.vercel.app/s/pizza-point`. This is what
`NEXT_PUBLIC_STOREFRONT_URL=https://<storefront-url>/s/{slug}` sets up.

**With your own domain (e.g. `pizza-point.quickstore.pk`):**
1. Add the domain to the storefront project, plus a wildcard `*.quickstore.pk`. Wildcards require
   the domain to use Vercel's nameservers.
2. Set `ROOT_DOMAIN` (API) and `STORE_ROOT_DOMAIN` (storefront) to `quickstore.pk`.
3. Set `NEXT_PUBLIC_STOREFRONT_URL=https://{slug}.quickstore.pk` on admin and ops, then redeploy them.
   The `/s/<slug>` addresses keep working as well.

> Stores remember the domain they were created under. If you change `ROOT_DOMAIN` after stores
> exist, their old addresses stop resolving. Pick it before going live.

---

## Checklist after deploying

- [ ] `https://<api-url>/health` shows `"status":"ok"`
- [ ] Sign up a test store at `https://<admin-url>/signup`
- [ ] Website design shows the live preview on the right
- [ ] Publish, then open the store link: products, cart and checkout work
- [ ] Place a test order and confirm it appears on **Orders** within a few seconds
- [ ] Super Admin login works with the authenticator code

## What behaves differently on Vercel

- **Order alerts** arrive by checking every 5 seconds rather than instantly. This keeps them
  reliable across Vercel's many server instances.
- **Rate limits** are counted per server instance, so they're looser than on a single server.
  Add Redis (e.g. Upstash) before heavy traffic. See the plan's §12.
- **Uploads:** images up to 3 MB, stored in your MongoDB. Vercel caps requests at 4.5 MB.
- **Notifications** (SMS/WhatsApp/email) are only written to the logs until a provider is connected.
  You can view them under the API project's **Logs** tab.
