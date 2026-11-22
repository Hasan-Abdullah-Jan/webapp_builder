import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getStore } from '@/lib/api';
import { StoreProvider } from '@/components/StoreProvider';
import { ThemeRoot } from '@/components/ThemeRoot';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export async function generateMetadata(): Promise<Metadata> {
  const data = await getStore().catch(() => null);
  if (!data) return { title: 'Store not found', robots: { index: false } };
  const seo = data.config.seo ?? {};
  return {
    title: { default: seo.title || data.store.name, template: `%s · ${data.store.name}` },
    description: seo.description || `Order online from ${data.store.name}`,
    icons: data.config.theme.favicon ? [{ url: data.config.theme.favicon }] : undefined,
    openGraph: {
      title: seo.title || data.store.name,
      description: seo.description,
      images: seo.ogImage ? [seo.ogImage] : undefined,
      type: 'website',
    },
  };
}

export default async function StoreLayout({ children }: { children: ReactNode }) {
  let data: Awaited<ReturnType<typeof getStore>>;
  try {
    data = await getStore();
  } catch (err) {
    // API down or API_URL not set: explain instead of crashing.
    console.error('[storefront] API unreachable:', (err as Error).message);
    return (
      <main className="empty" style={{ fontFamily: 'system-ui, sans-serif', padding: '96px 16px' }}>
        <h1 style={{ fontSize: 26 }}>This store can&apos;t load right now</h1>
        <p style={{ color: '#666', maxWidth: 460, margin: '0 auto' }}>
          The store&apos;s server isn&apos;t responding. If you run this site: start the API (<code>npm run dev:api</code>) or set <code>API_URL</code>.
        </p>
      </main>
    );
  }
  if (!data) {
    // Plan §3.3 step 7: unknown, unpublished or suspended hosts get a friendly page.
    return (
      <main className="empty" style={{ fontFamily: 'system-ui, sans-serif', padding: '96px 16px' }}>
        <h1 style={{ fontSize: 28 }}>This store isn&apos;t available</h1>
        <p style={{ color: '#666' }}>The address may be wrong, or the store hasn&apos;t opened yet. Please check back soon.</p>
      </main>
    );
  }
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: data.store.name,
    ...(data.branches[0]?.address ? { address: data.branches[0].address } : {}),
    ...(data.branches[0]?.phone ? { telephone: data.branches[0].phone } : {}),
  };
  return (
    <ThemeRoot theme={data.config.theme}>
      <StoreProvider data={data}>
        <Header />
        <main style={{ flex: 1 }}>{children}</main>
        <Footer data={data} />
      </StoreProvider>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </ThemeRoot>
  );
}
