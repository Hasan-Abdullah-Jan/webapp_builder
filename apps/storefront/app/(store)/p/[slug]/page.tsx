import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getMenu, getStore, storeHost } from '@/lib/api';
import { catalogPath, DEFAULT_VOCAB } from '@/lib/types';
import { money } from '@/lib/format';
import { ProductOptions } from '@/components/ProductModal';
import { ProductCard } from '@/components/ProductCard';
import { ProductGallery } from '@/components/ProductGallery';

async function load(slug: string) {
  const data = await getStore();
  if (!data) return null;
  const menu = await getMenu(data.branches[0]?._id);
  const item = menu.items.find((i) => i.slug === slug);
  return item ? { data, menu, item } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  if (!r) return { title: 'Not found' };
  const host = await storeHost();
  const image = r.item.images?.[0];
  return {
    title: r.item.name,
    description: r.item.description ?? `${r.item.name} at ${r.data.store.name}`,
    openGraph: {
      title: r.item.name,
      description: r.item.description,
      images: image ? [image.startsWith('/') ? `https://${host}${image}` : image] : undefined,
    },
  };
}

/** Product detail page (SEO + shareable link), plan §8. */
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await load(slug);
  if (!r) notFound();
  const { data, menu, item } = r;
  const v = data.store.vocab ?? DEFAULT_VOCAB;
  const category = menu.categories.find((c) => c._id === item.categoryId);
  const related = menu.items.filter((i) => i._id !== item._id && i.categoryId === item.categoryId && i.available).slice(0, 4);
  const prices = item.variants?.length ? item.variants.map((x) => x.price) : [item.price];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: item.name,
    description: item.description,
    ...(item.images?.[0] && !item.images[0].startsWith('/') ? { image: item.images[0] } : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: data.store.currency,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      availability: item.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <div className="container product-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={(data.base ?? '') + catalogPath(v)}><ChevronLeft size={16} /> {category ? category.name : v.catalog}</Link>
      </nav>
      <div className="product-layout">
        <ProductGallery images={item.images ?? []} name={item.name} />
        <div className="product-info">
          {item.tags?.length ? <div className="row" style={{ gap: 6 }}>{item.tags.slice(0, 3).map((t) => <span key={t} className="tag static">{t}</span>)}</div> : null}
          <h1>{item.name}</h1>
          <p className="price big">
            {prices.length > 1 && Math.min(...prices) !== Math.max(...prices) ? `From ${money(Math.min(...prices), data.store.currency)}` : money(prices[0], data.store.currency)}
          </p>
          {!item.available && <div className="notice">Currently sold out</div>}
          {item.description && <p className="desc-text">{item.description}</p>}
          <div className="product-options">
            <ProductOptions item={item} inline />
          </div>
          <ul className="assurance">
            {data.config.features?.delivery?.enabled && <li>Delivery available{data.config.settings?.freeDeliveryAbove ? `, free over ${money(data.config.settings.freeDeliveryAbove, data.store.currency)}` : ''}</li>}
            {data.config.features?.pickup?.enabled && <li>{v.pickup} available</li>}
            {data.config.features?.cod?.enabled && <li>Pay with cash on delivery</li>}
          </ul>
        </div>
      </div>
      {related.length > 0 && (
        <section className="section">
          <h2 className="section-title">You may also like</h2>
          <div className="grid cols-4">{related.map((i) => <ProductCard key={i._id} item={i} />)}</div>
        </section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </div>
  );
}
