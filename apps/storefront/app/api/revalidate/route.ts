import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cache purge hook (plan §11.2 step 4). The API calls this after a publish, suspension or
 * reactivation so the change shows immediately instead of after the cache TTL.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET ?? '';
  const given = req.headers.get('x-revalidate-secret') ?? '';
  const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ code: 'FORBIDDEN' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const hosts: unknown = body?.hosts;
  if (!Array.isArray(hosts) || hosts.length > 20) return NextResponse.json({ code: 'BAD_REQUEST' }, { status: 400 });
  for (const h of hosts) {
    if (typeof h === 'string' && /^[a-z0-9.-]{1,253}$/.test(h)) revalidateTag(`store:${h}`);
  }
  return NextResponse.json({ revalidated: hosts.length });
}
