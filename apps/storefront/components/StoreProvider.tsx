'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { catalogPath, DEFAULT_VOCAB, type StoreData, type Vocab } from '@/lib/types';

export interface CartLine {
  key: string;
  productId: string;
  variantId?: string;
  variantName?: string;
  image?: string;
  name: string;
  unitPrice: number; // display estimate; the server recalculates every price at checkout
  quantity: number;
  modifiers: { groupId: string; optionIds: string[] }[];
  modifierNames: string[];
}

type Mode = 'delivery' | 'pickup';

interface CartState {
  lines: CartLine[];
  mode: Mode;
  branchId?: string;
}

interface Ctx {
  data: StoreData;
  cart: CartState;
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, 'key'>) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  setMode: (m: Mode) => void;
  setBranch: (id: string) => void;
  drawerOpen: boolean;
  openDrawer: (open: boolean) => void;
  feature: (key: string) => boolean;
  /** Wording for this business type (Menu/Shop/Services...). */
  v: Vocab;
  catalogHref: string;
}

const StoreCtx = createContext<Ctx | null>(null);

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside StoreProvider');
  return c;
}

const lineKey = (l: Omit<CartLine, 'key'>) =>
  l.productId + '|' + (l.variantId ?? '') + '|' + l.modifiers.map((m) => `${m.groupId}:${[...m.optionIds].sort().join(',')}`).sort().join(';');

function loadCart(slug: string): CartState | null {
  try {
    const raw = localStorage.getItem(`qs-cart:${slug}`);
    return raw ? (JSON.parse(raw) as CartState) : null;
  } catch {
    return null;
  }
}

export function StoreProvider({ data, children }: { data: StoreData; children: ReactNode }) {
  const f = data.config.features ?? {};
  const defaultMode: Mode = f.delivery?.enabled ? 'delivery' : 'pickup';
  const [cart, setCart] = useState<CartState>({ lines: [], mode: defaultMode, branchId: data.branches[0]?._id });
  const [drawerOpen, openDrawer] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (data.preview) return setLoaded(true);
    const saved = loadCart(data.store.slug);
    if (saved) {
      const branchOk = saved.branchId && data.branches.some((b) => b._id === saved.branchId);
      const modeOk = f[saved.mode]?.enabled;
      setCart({ ...saved, mode: modeOk ? saved.mode : defaultMode, branchId: branchOk ? saved.branchId : data.branches[0]?._id });
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.store.slug]);

  useEffect(() => {
    if (!loaded || data.preview) return;
    try {
      localStorage.setItem(`qs-cart:${data.store.slug}`, JSON.stringify(cart));
    } catch {
      /* storage unavailable: cart still works for this visit */
    }
  }, [cart, loaded, data.store.slug, data.preview]);

  const add = useCallback((line: Omit<CartLine, 'key'>) => {
    const key = lineKey(line);
    setCart((c) => {
      const existing = c.lines.find((l) => l.key === key);
      const lines = existing
        ? c.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l))
        : [...c.lines, { ...line, key }];
      return { ...c, lines };
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setCart((c) => ({
      ...c,
      lines: qty <= 0 ? c.lines.filter((l) => l.key !== key) : c.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, qty) } : l)),
    }));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      data,
      cart,
      count: cart.lines.reduce((s, l) => s + l.quantity, 0),
      subtotal: cart.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
      add,
      setQty,
      clear: () => setCart((c) => ({ ...c, lines: [] })),
      setMode: (mode) => setCart((c) => ({ ...c, mode })),
      setBranch: (branchId) => setCart((c) => ({ ...c, branchId })),
      drawerOpen,
      openDrawer,
      feature: (key) => Boolean(data.config.features?.[key]?.enabled),
      v: data.store.vocab ?? DEFAULT_VOCAB,
      catalogHref: catalogPath(data.store.vocab ?? DEFAULT_VOCAB),
    }),
    [data, cart, add, setQty, drawerOpen],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
