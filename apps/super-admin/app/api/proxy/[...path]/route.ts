import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, clearSessionCookies, clientIpHeaders, isSameOrigin, readSession, refreshTokens, setSessionCookies } from '@/lib/session';

/** Authenticated proxy to /v1/platform/* (never the tenant admin API). */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path[0] === 'auth' || path.some((p) => p === '..' || p.includes('/'))) return NextResponse.json({ code: 'BAD_PATH' }, { status: 400 });
  if (req.method !== 'GET' && (!isSameOrigin(req) || req.headers.get('x-qs-csrf') !== '1')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: 'Cross-site request blocked' }, { status: 403 });
  }
  const target = `${API_URL}/v1/platform/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
  const body = req.method === 'GET' ? undefined : await req.text();
  const { access, refresh } = await readSession();
  const call = (token: string) =>
    fetch(target, { method: req.method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...clientIpHeaders(req) }, body, cache: 'no-store' });

  let rotated: { accessToken: string; refreshToken: string } | null = null;
  let res = access ? await call(access) : null;
  if ((!res || res.status === 401) && refresh) {
    rotated = await refreshTokens(refresh);
    if (rotated) res = await call(rotated.accessToken);
  }
  if (!res) {
    const out = NextResponse.json({ code: 'UNAUTHORIZED', message: 'Please log in' }, { status: 401 });
    clearSessionCookies(out);
    return out;
  }
  const out = new NextResponse(await res.arrayBuffer(), { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } });
  if (rotated) setSessionCookies(out, rotated);
  if (res.status === 401 && !rotated) clearSessionCookies(out);
  return out;
}

export { handle as GET, handle as POST, handle as PATCH };
export const dynamic = 'force-dynamic';
