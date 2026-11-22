'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Share2, X } from 'lucide-react';
import type { MenuItem } from '@/lib/types';
import { initials, money } from '@/lib/format';
import { useStore } from './StoreProvider';

/** Item details with variant (size/colour) choice, option groups, quantity and live price. */
export function ProductOptions({ item, onAdded, inline }: { item: MenuItem; onAdded?: () => void; inline?: boolean }) {
  const { add, data, feature, openDrawer, v } = useStore();
  const groups = feature('modifiers') ? item.modifierGroups : [];
  const variants = item.variants ?? [];
  const [variantId, setVariantId] = useState<string | undefined>(variants[0]?._id);
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map((g) => [g._id, g.min === 1 && g.max === 1 && g.options[0] ? [g.options[0]._id] : []])),
  );
  const [qty, setQty] = useState(1);
  const currency = data.store.currency;
  const variant = variants.find((x) => x._id === variantId);

  const unit = useMemo(() => {
    let p = variant ? variant.price : item.price;
    for (const g of groups) for (const id of picked[g._id] ?? []) p += g.options.find((o) => o._id === id)?.price ?? 0;
    return p;
  }, [item.price, variant, groups, picked]);

  const problems = groups.filter((g) => (picked[g._id]?.length ?? 0) < g.min);

  function toggle(gid: string, oid: string, single: boolean, max: number, min: number) {
    setPicked((p) => {
      const cur = p[gid] ?? [];
      if (single) return { ...p, [gid]: cur.includes(oid) && min === 0 ? [] : [oid] };
      if (cur.includes(oid)) return { ...p, [gid]: cur.filter((x) => x !== oid) };
      if (cur.length >= max) return p;
      return { ...p, [gid]: [...cur, oid] };
    });
  }

  function addToCart() {
    const modifiers = groups.filter((g) => picked[g._id]?.length).map((g) => ({ groupId: g._id, optionIds: picked[g._id] }));
    const modifierNames = [
      ...(variant ? [variant.name] : []),
      ...groups.flatMap((g) => (picked[g._id] ?? []).map((id) => g.options.find((o) => o._id === id)?.name ?? '')),
    ];
    add({
      productId: item._id, variantId: variant?._id, variantName: variant?.name, image: item.images?.[0], name: item.name,
      unitPrice: unit, quantity: qty, modifiers, modifierNames,
    });
    onAdded?.();
    openDrawer(true);
  }

  const variantLabel = /\b(xs|s|m|l|xl|xxl|\d{2})\b/i.test(variants.map((x) => x.name).join(' ')) ? 'Size' : 'Choose';

  return (
    <>
      <div className={inline ? '' : 'content'}>
        {variants.length > 0 && (
          <fieldset className="group variants">
            <legend>{variantLabel}<span className="req">{variant ? variant.name : 'Required'}</span></legend>
            <div className="chips" role="radiogroup" aria-label={variantLabel}>
              {variants.map((x) => (
                <button key={x._id} type="button" role="radio" aria-checked={variantId === x._id} className={`chip${variantId === x._id ? ' on' : ''}`} onClick={() => setVariantId(x._id)}>
                  {x.name}
                  {variants.some((y) => y.price !== x.price) && <span className="chip-price">{money(x.price, currency)}</span>}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {groups.map((g) => {
          const single = g.max === 1;
          return (
            <fieldset key={g._id} className="group">
              <legend>
                {g.name}
                <span className="req">
                  {g.min > 0 ? (g.min === g.max ? `Choose ${g.min}` : `Choose ${g.min}–${g.max}`) : `Optional${g.max > 1 ? `, up to ${g.max}` : ''}`}
                </span>
              </legend>
              {g.options.map((o) => {
                const checked = picked[g._id]?.includes(o._id) ?? false;
                return (
                  <label key={o._id} className="opt">
                    <input type={single ? 'radio' : 'checkbox'} name={`${item._id}-${g._id}`} checked={checked}
                      onChange={() => toggle(g._id, o._id, single, g.max, g.min)}
                      onClick={() => single && g.min === 0 && checked && setPicked((p) => ({ ...p, [g._id]: [] }))} />
                    <span style={{ flex: 1 }}>{o.name}</span>
                    {o.price > 0 && <span className="muted small">+{money(o.price, currency)}</span>}
                  </label>
                );
              })}
            </fieldset>
          );
        })}
      </div>
      <div className={inline ? 'actions inline' : 'actions'}>
        <div className="qty" aria-label="Quantity">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease"><Minus size={16} /></button>
          <span aria-live="polite">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="Increase"><Plus size={16} /></button>
        </div>
        <button className="btn" style={{ flex: 1 }} disabled={!item.available || problems.length > 0 || data.preview || !data.store.acceptingOrders} onClick={addToCart}>
          {!item.available ? 'Sold out' : !data.store.acceptingOrders ? 'Not taking orders' : problems.length ? `Choose ${problems[0].name.toLowerCase()}` : `${v.orderVerb === 'Book' ? 'Book' : 'Add to cart'} · ${money(unit * qty, currency)}`}
        </button>
      </div>
    </>
  );
}

export function ProductModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const { data, href } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function share() {
    const url = `${window.location.origin}${href(`/p/${item.slug}`)}`;
    if (navigator.share) await navigator.share({ title: item.name, url }).catch(() => {});
    else await navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pm-title" tabIndex={-1} ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <div className="media" style={{ position: 'relative' }}>
          {item.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.images[0]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div className="placeholder" aria-hidden>{initials(item.name)}</div>
          )}
          <button className="close" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12 }}><X size={18} /></button>
        </div>
        <div className="content" style={{ paddingBottom: 0 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <h2 id="pm-title" style={{ fontSize: 24, flex: 1 }}>{item.name}</h2>
            {!data.preview && <button className="icon-btn" onClick={share} aria-label="Share"><Share2 size={18} /></button>}
          </div>
          {item.description && <p className="muted" style={{ marginTop: 0 }}>{item.description}</p>}
          <p className="price" style={{ fontSize: 18 }}>
            {item.variants?.length ? `From ${money(Math.min(...item.variants.map((x) => x.price)), data.store.currency)}` : money(item.price, data.store.currency)}
          </p>
          {!data.preview && <Link href={href(`/p/${item.slug}`)} className="small muted">View full details</Link>}
        </div>
        <ProductOptions item={item} onAdded={onClose} />
      </div>
    </div>
  );
}
