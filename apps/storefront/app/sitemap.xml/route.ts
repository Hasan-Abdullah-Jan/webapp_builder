import { getStore, storeHost } from '@/lib/api';

export async function GET() {
  const data = await getStore();
  if (!data) return new Response('Not found', { status: 404 });
  const host = await storeHost();
  const urls = ['/', '/menu'].map((p) => `  <url><loc>https://${host}${p}</loc><changefreq>daily</changefreq></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
