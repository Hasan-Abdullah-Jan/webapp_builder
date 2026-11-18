import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/signup', '/api/auth', '/api/public'];

/** Pages require a session cookie; the API still verifies every request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.next(); // proxy answers 401 itself
  if (!req.cookies.get('qs_rt')?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };
