import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/session';

/** Unauthenticated wizard data: templates, presets, slug availability. GET only. */
const ALLOWED = new Map([
  ['templates', '/v1/public/templates'],
  ['wizard-options', '/v1/public/wizard-options'],
  ['slug-available', '/v1/auth/slug-available'],
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = ALLOWED.get(path.join('/'));
  if (!target) return NextResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  const r = await fetch(`${API_URL}${target}${req.nextUrl.search}`, { cache: 'no-store' });
  return new NextResponse(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } });
}
