'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import type { Menu } from '@/lib/types';
import { ProductCard } from './ProductCard';
import { useStore } from './StoreProvider';

/** Menu with sticky category tabs, scroll-spy and search (plan §8). */
export function MenuView({ menu }: { menu: Menu }) {
  const { data, v } = useStore();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [active, setActive] = useState(menu.categories[0]?.slug);
  const cols = data.config.layout.productCard?.imageRatio === 'landscape' ? 3 : 4;

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const uncategorised = menu.items.filter((i) => !i.categoryId || !menu.categories.some((c) => c._id === i.categoryId));
    const cats = uncategorised.length ? [...menu.categories, { _id: '__other', name: 'More', slug: 'more' }] : menu.categories;
    return cats
      .map((c) => ({
        c,
        items: menu.items.filter(
          (i) => (c._id === '__other' ? !i.categoryId || !menu.categories.some((x) => x._id === i.categoryId) : i.categoryId === c._id) && (!needle || i.name.toLowerCase().includes(needle) || i.description?.toLowerCase().includes(needle)),
        ),
      }))
      .filter((g) => g.items.length);
  }, [menu, q]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: '-140px 0px -60% 0px' },
    );
    document.querySelectorAll('.menu-cat').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [groups]);

  return (
    <>
      <div className="menu-tabs">
        <div className="inner" role="tablist" aria-label="Menu categories">
          {groups.map(({ c }) => (
            <button
              key={c._id}
              role="tab"
              aria-selected={active === c.slug}
              className={active === c.slug ? 'active' : ''}
              onClick={() => document.getElementById(c.slug)?.scrollIntoView({ behavior: 'smooth' })}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <div className="container" style={{ paddingBottom: 48 }}>
        <div className="row" style={{ paddingTop: 24, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 32 }}>{v.catalog}</h1>
          <span className="spacer" />
          <label className="sr-only" htmlFor="menu-search">Search {v.items.toLowerCase()}</label>
          <div className="search-wrap">
            <Search size={16} aria-hidden />
            <input id="menu-search" className="search" type="search" placeholder={`Search ${v.items.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {groups.length === 0 && <p className="empty muted">No items match “{q}”.</p>}
        {groups.map(({ c, items }) => (
          <section key={c._id} id={c.slug} className="menu-cat" aria-labelledby={`h-${c.slug}`}>
            <h2 id={`h-${c.slug}`} style={{ fontSize: 24 }}>{c.name}</h2>
            <div className={`grid cols-${cols}`}>
              {items.map((i) => <ProductCard key={i._id} item={i} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
