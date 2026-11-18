import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, clearSessionCookies, clientIpHeaders, isSameOrigin, readSession, setSessionCookies } from '@/lib/session';

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!isSameOrigin(req)) return NextResponse.json({ code: 'FORBIDDEN', message: 'Bad origin' }, { status: 403 });
  if (action === 'logout') {
    const { refresh } = await readSession();
    if (refresh) {
      await fetch(`${API_URL}/v1/platform/auth/logout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }), cache: 'no-store',
      }).catch(() => {});
    }
    const res = NextResponse.json({ ok: true });
    clearSessionCookies(res);
    return res;
  }
  if (action !== 'login') return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  const body = await req.text();
  if (body.length > 5000) return NextResponse.json({ code: 'TOO_LARGE' }, { status: 413 });
  const r = await fetch(`${API_URL}/v1/platform/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': req.headers.get('user-agent') ?? '', ...clientIpHeaders(req) },
    body,
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json(data, { status: r.status });
  const res = NextResponse.json({ ok: true });
  setSessionCookies(res, data);
  return res;
}
