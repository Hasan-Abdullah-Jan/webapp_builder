import { NextResponse, type NextRequest } from 'next/server';

/**
 * Super Admin gate: session cookie required, plus an optional IP allow-list at the edge
 * (OPS_IP_ALLOWLIST, comma-separated). The API enforces its own allow-list and 2FA as well.
 */
export function middleware(req: NextRequest) {
  const allow = (process.env.OPS_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length) {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    if (!allow.includes(ip)) return new NextResponse('Not allowed from this network', { status: 403 });
  }
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/api/')) return NextResponse.next();
  if (!req.cookies.get('qs_ops_rt')?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
