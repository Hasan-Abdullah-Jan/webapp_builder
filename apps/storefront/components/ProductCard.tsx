'use client';

import { useState } from 'react';
import type { MenuItem } from '@/lib/types';
import { initials, money } from '@/lib/format';
import { useStore } from './StoreProvider';
import { ProductModal } from './ProductModal';

export function ProductCard({ item }: { item: MenuItem }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const pc = data.config.layout.productCard ?? {};
  const landscape = pc.imageRatio === 'landscape';
  return (
    <>
      <button
        type="button"
        className={`card${landscape ? ' landscape' : ''}`}
        aria-disabled={!item.available}
        onClick={() => item.available && setOpen(true)}
        aria-label={`${item.name}, ${money(item.price, data.store.currency)}${item.available ? '' : ', sold out'}`}
      >
        <div className="media">
          {item.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.images[0]} alt="" loading="lazy" />
          ) : (
            <div className="placeholder" aria-hidden>{initials(item.name)}</div>
          )}
          {!item.available ? <span className="tag dark">Sold out</span> : item.tags?.[0] && <span className="tag">{item.tags[0]}</span>}
        </div>
        <div className="body">
          <span className="name">{item.name}</span>
          {pc.showDescription !== false && item.description && <span className="desc">{item.description}</span>}
          <div className="foot">
            <span className="price">{money(item.price, data.store.currency)}</span>
            {item.available && <span className="add-pill" aria-hidden>+</span>}
          </div>
        </div>
      </button>
      {open && <ProductModal item={item} onClose={() => setOpen(false)} />}
    </>
  );
}
