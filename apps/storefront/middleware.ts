import { NextResponse, type NextRequest } from 'next/server';

/**
 * Two ways to reach a store:
 *  1. Its own host: pizza-point.quickstore.pk (needs a wildcard domain).
 *  2. A path on any host: my-app.vercel.app/s/pizza-point/... (works on a plain *.vercel.app
 *     domain). The /s/<slug> prefix is stripped here and the store is passed to the app in
 *     x-store-host / x-store-base headers. Incoming copies of those headers are always removed,
 *     so a visitor can't choose them.
 * Also sets frame-ancestors: only the builder preview may be embedded, and only by the admin.
 */
const SLUG = /^\/s\/([a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9]))(\/.*)?$/;

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.delete('x-store-host');
  headers.delete('x-store-base');

  const m = url.pathname.match(SLUG);
  let path = url.pathname;
  let res: NextResponse;
  if (m) {
    const root = (process.env.STORE_ROOT_DOMAIN ?? 'localhost').toLowerCase();
    path = m[2] || '/';
    headers.set('x-store-host', `${m[1]}.${root}`);
    headers.set('x-store-base', `/s/${m[1]}`);
    const target = url.clone();
    target.pathname = path;
    res = NextResponse.rewrite(target, { request: { headers } });
  } else {
    res = NextResponse.next({ request: { headers } });
  }

  const admin = process.env.ADMIN_ORIGIN ?? 'http://localhost:3001';
  res.headers.set('Content-Security-Policy', `frame-ancestors 'self'${path === '/preview' ? ` ${admin}` : ''}`);
  return res;
}

export const config = { matcher: ['/((?!_next/|favicon.ico|media/).*)'] };
