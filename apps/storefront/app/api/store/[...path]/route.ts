import { NextResponse, type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api';

/**
 * Same-origin proxy from the browser to the API (BFF). Only these storefront calls are allowed;
 * the store is always the host the visitor is on, never something the browser chooses.
 */
const ALLOWED: { method: string; re: RegExp; preview?: boolean }[] = [
  { method: 'GET', re: /^config$/, preview: true },
  { method: 'GET', re: /^menu$/, preview: true },
  { method: 'POST', re: /^cart\/quote$/ },
  { method: 'POST', re: /^orders$/ },
  { method: 'GET', re: /^orders\/[a-f0-9]{24}\/track$/ },
];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join('/');
  const rule = ALLOWED.find((r) => r.method === req.method && r.re.test(joined));
  if (!rule) return NextResponse.json({ code: 'NOT_FOUND', message: 'Not found' }, { status: 404 });

  const host = (req.headers.get('x-store-host') ?? req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim().toLowerCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Store-Host': host };
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) headers['X-Forwarded-For'] = fwd;
  const idem = req.headers.get('idempotency-key');
  if (idem) headers['Idempotency-Key'] = idem.slice(0, 128);
  const preview = req.headers.get('x-preview-token');
  if (preview && rule.preview) headers['X-Preview-Token'] = preview.slice(0, 2000);

  const body = req.method === 'POST' ? await req.text() : undefined;
  if (body && body.length > 100_000) return NextResponse.json({ code: 'TOO_LARGE', message: 'Request too large' }, { status: 413 });

  const res = await fetch(`${API_URL}/v1/store/${joined}${req.nextUrl.search}`, { method: req.method, headers, body, cache: 'no-store' });
  const text = await res.text();
  return new NextResponse(text, { status: res.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export { proxy as GET, proxy as POST };
