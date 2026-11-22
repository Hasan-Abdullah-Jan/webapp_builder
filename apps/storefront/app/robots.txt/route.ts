import { getStore, storeBase, storeHost } from '@/lib/api';

export async function GET() {
  const data = await getStore();
  const base = await storeBase();
  const host = await storeHost();
  const privatePaths = 'Disallow: /checkout\nDisallow: /order/\nDisallow: /preview\nDisallow: /api/\nDisallow: /s/*/checkout\nDisallow: /s/*/order/\nDisallow: /s/*/preview\n';
  // A store's own domain points crawlers at its sitemap. The shared storefront host (path-based
  // stores under /s/<slug>) stays crawlable so every store can be indexed.
  const body = data && !base
    ? `User-agent: *\nAllow: /\n${privatePaths}\nSitemap: https://${host}/sitemap.xml\n`
    : `User-agent: *\nAllow: /\n${privatePaths}`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
