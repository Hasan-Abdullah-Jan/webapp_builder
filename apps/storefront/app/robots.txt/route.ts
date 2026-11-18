import { getStore, storeHost } from '@/lib/api';

export async function GET() {
  const data = await getStore();
  const host = await storeHost();
  const body = data
    ? `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /order/\nDisallow: /preview\nDisallow: /api/\n\nSitemap: https://${host}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
