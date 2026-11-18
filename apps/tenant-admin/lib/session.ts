import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const ACCESS_COOKIE = 'qs_at';
export const REFRESH_COOKIE = 'qs_rt';
const secure = process.env.NODE_ENV === 'production';

/** Tokens live only in httpOnly cookies on the admin origin; page JavaScript never sees them. */
export function setSessionCookies(res: NextResponse, tokens: { accessToken: string; refreshToken: string }) {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 15 * 60 });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 30 * 24 * 3600 });
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function readSession() {
  const c = await cookies();
  return { access: c.get(ACCESS_COOKIE)?.value, refresh: c.get(REFRESH_COOKIE)?.value };
}

export async function refreshTokens(refreshToken: string) {
  const r = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!r.ok) return null;
  return (await r.json()) as { accessToken: string; refreshToken: string };
}

/** CSRF defence for cookie-authenticated writes: same-origin check + custom header. */
export function isSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
