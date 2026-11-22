import { getStore, storeBase, storeHost } from '@/lib/api';
import { catalogPath, DEFAULT_VOCAB } from '@/lib/types';

export async function GET() {
  const data = await getStore();
  if (!data) return new Response('Not found', { status: 404 });
  const base = await storeBase();
  // Path-based stores live on the storefront's own host; host-based ones on their domain.
  const origin = base ? '' : `https://${await storeHost()}`;
  const paths = ['/', catalogPath(data.store.vocab ?? DEFAULT_VOCAB)];
  const urls = paths.map((p) => `  <url><loc>${origin}${base}${p}</loc><changefreq>daily</changefreq></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
