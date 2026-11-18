import 'server-only';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
// Distinct cookie names and a distinct origin: nothing is shared with tenant apps (plan §3.4).
export const ACCESS_COOKIE = 'qs_ops_at';
export const REFRESH_COOKIE = 'qs_ops_rt';
const secure = process.env.NODE_ENV === 'production';

export function setSessionCookies(res: NextResponse, t: { accessToken: string; refreshToken: string }) {
  res.cookies.set(ACCESS_COOKIE, t.accessToken, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 15 * 60 });
  res.cookies.set(REFRESH_COOKIE, t.refreshToken, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 12 * 3600 });
}

export function clearSessionCookies(res: NextResponse) {
  for (const n of [ACCESS_COOKIE, REFRESH_COOKIE]) res.cookies.set(n, '', { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 0 });
}

export async function readSession() {
  const c = await cookies();
  return { access: c.get(ACCESS_COOKIE)?.value, refresh: c.get(REFRESH_COOKIE)?.value };
}

export async function refreshTokens(refreshToken: string) {
  const r = await fetch(`${API_URL}/v1/platform/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }), cache: 'no-store',
  });
  return r.ok ? ((await r.json()) as { accessToken: string; refreshToken: string }) : null;
}

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

/** Forward the operator's IP so the API's PLATFORM_IP_ALLOWLIST applies to the real client. */
export function clientIpHeaders(req: Request): Record<string, string> {
  const xff = req.headers.get('x-forwarded-for');
  return xff ? { 'X-Forwarded-For': xff } : {};
}
