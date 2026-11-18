'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MenuItem } from '@/lib/types';
import { initials, money } from '@/lib/format';
import { useStore } from './StoreProvider';

export function ProductModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { add, data, feature, openDrawer } = useStore();
  const groups = feature('modifiers') ? item.modifierGroups : [];
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(groups.map((g) => [g._id, g.min === 1 && g.max === 1 && g.options[0] ? [g.options[0]._id] : []])),
  );
  const [qty, setQty] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const currency = data.store.currency;

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

  const unit = useMemo(() => {
    let p = item.price;
    for (const g of groups) for (const id of picked[g._id] ?? []) p += g.options.find((o) => o._id === id)?.price ?? 0;
    return p;
  }, [item.price, groups, picked]);

  const problems = groups.filter((g) => (picked[g._id]?.length ?? 0) < g.min);

  function toggle(gid: string, oid: string, single: boolean, max: number) {
    setPicked((p) => {
      const cur = p[gid] ?? [];
      if (single) return { ...p, [gid]: [oid] };
      if (cur.includes(oid)) return { ...p, [gid]: cur.filter((x) => x !== oid) };
      if (cur.length >= max) return p;
      return { ...p, [gid]: [...cur, oid] };
    });
  }

  function addToCart() {
    const modifiers = groups.filter((g) => picked[g._id]?.length).map((g) => ({ groupId: g._id, optionIds: picked[g._id] }));
    const modifierNames = groups.flatMap((g) => (picked[g._id] ?? []).map((id) => g.options.find((o) => o._id === id)?.name ?? ''));
    add({ productId: item._id, name: item.name, unitPrice: unit, quantity: qty, modifiers, modifierNames });
    onClose();
    openDrawer(true);
  }

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pm-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="media" style={{ position: 'relative' }}>
          {item.images?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.images[0]} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div className="placeholder" aria-hidden>{initials(item.name)}</div>
          )}
          <button className="close" onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 12, right: 12 }}>×</button>
        </div>
        <div className="content">
          <h2 id="pm-title" style={{ fontSize: 24 }}>{item.name}</h2>
          {item.description && <p className="muted" style={{ marginTop: 0 }}>{item.description}</p>}
          <p className="price" style={{ fontSize: 18 }}>{money(item.price, currency)}</p>
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
                      <input
                        type={single ? 'radio' : 'checkbox'}
                        name={g._id}
                        checked={checked}
                        onChange={() => (single && !g.min && checked ? setPicked((p) => ({ ...p, [g._id]: [] })) : toggle(g._id, o._id, single, g.max))}
                        onClick={() => single && g.min === 0 && checked && setPicked((p) => ({ ...p, [g._id]: [] }))}
                      />
                      <span style={{ flex: 1 }}>{o.name}</span>
                      {o.price > 0 && <span className="muted small">+{money(o.price, currency)}</span>}
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
        </div>
        <div className="actions">
          <div className="qty" aria-label="Quantity">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
            <span aria-live="polite">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="Increase">+</button>
          </div>
          <button className="btn" style={{ flex: 1 }} disabled={!item.available || problems.length > 0 || data.preview} onClick={addToCart}>
            {!item.available ? 'Sold out' : problems.length ? `Choose ${problems[0].name.toLowerCase()}` : `Add · ${money(unit * qty, currency)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
