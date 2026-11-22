import { withApiErrors } from '@/lib/apiErrors';
import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, clearSessionCookies, isSameOrigin, readSession, refreshTokens, setSessionCookies } from '@/lib/session';

/**
 * Authenticated proxy to /v1/admin/*. Adds the bearer token from the httpOnly cookie, refreshes
 * it transparently on 401, and rejects cross-site writes (Origin check + custom header).
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.some((p) => p === '..' || p.includes('/'))) return NextResponse.json({ code: 'BAD_PATH' }, { status: 400 });
  if (req.method !== 'GET' && (!isSameOrigin(req) || req.headers.get('x-qs-csrf') !== '1')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Cross-site request blocked' }, { status: 403 });
  }

  const target = `${API_URL}/v1/admin/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  // Bodies are forwarded as bytes so image uploads and CSV files arrive intact.
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());
  if (body && body.length > 4 * 1024 * 1024) return NextResponse.json({ code: 'TOO_LARGE', message: 'That file is too large' }, { status: 413 });
  const contentType = req.headers.get('content-type') ?? 'application/json';
  const filename = req.headers.get('x-filename');
  const isStream = path.join('/') === 'orders/stream';

  let { access } = await readSession();
  const { refresh } = await readSession();
  let rotated: { accessToken: string; refreshToken: string } | null = null;

  const call = (token?: string) =>
    fetch(target, {
      method: req.method,
      headers: { 'Content-Type': contentType, ...(filename ? { 'X-Filename': filename.slice(0, 80) } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
      cache: 'no-store',
      signal: isStream ? req.signal : undefined,
    });

  let res = access ? await call(access) : null;
  if ((!res || res.status === 401) && refresh) {
    rotated = await refreshTokens(refresh);
    if (rotated) {
      access = rotated.accessToken;
      res = await call(access);
    }
  }
  if (!res) {
    const out = NextResponse.json({ code: 'UNAUTHORIZED', message: 'Please log in' }, { status: 401 });
    clearSessionCookies(out);
    return out;
  }

  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition', 'cache-control']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }
  const out = new NextResponse(isStream ? res.body : await res.arrayBuffer(), { status: res.status, headers });
  if (rotated) setSessionCookies(out, rotated);
  if (res.status === 401 && !rotated) clearSessionCookies(out);
  return out;
}

const safe = withApiErrors(handle);
export { safe as GET, safe as POST, safe as PATCH, safe as DELETE };
export const dynamic = 'force-dynamic';
