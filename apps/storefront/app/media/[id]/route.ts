import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

/** Serves uploaded images (public, immutable) from the API. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{24}$/.test(id)) return new NextResponse('Not found', { status: 404 });
  const r = await fetch(`${API_URL}/v1/media/${id}`, { cache: 'force-cache' });
  if (!r.ok) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(r.body, {
    headers: {
      'Content-Type': r.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
