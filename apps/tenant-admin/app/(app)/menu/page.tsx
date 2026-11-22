'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronUp, ChevronsUpDown, Copy, Download, Eye, EyeOff, FileSpreadsheet, ImageIcon, Layers, Package, Pencil,
  Plus, Search, SlidersHorizontal, Trash2, Upload,
} from 'lucide-react';
import { api, money, slugify } from '@/lib/client';
import { useMe } from '@/components/Shell';
import {
  ActionMenu, Drawer, EmptyState, ErrorBox, Field, ImageUploader, Modal, PageHeader, SkeletonRows, Switch, fieldErrors, useDialog, useLoad, useToast,
} from '@/components/ui';

interface Category { _id: string; name: string; slug: string; sort: number; visible: boolean; image?: string }
interface Option { name: string; price: number; available?: boolean }
interface Group { _id: string; name: string; min: number; max: number; options: Option[] }
interface Variant { _id?: string; name: string; price: number }
interface Product {
  _id: string; name: string; slug: string; description?: string; categoryId?: string; basePrice: number;
  images?: string[]; tags?: string[]; modifierGroupIds?: string[]; active: boolean; stock?: number; sort: number; variants?: Variant[];
}
type Tab = 'items' | 'categories' | 'options';

function CatalogInner() {
  const { me, can, v } = useMe();
  const toast = useToast();
  const dialog = useDialog();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>('items');
  const cats = useLoad(() => api<{ items: Category[] }>('categories').then((r) => r.items));
  const prods = useLoad(() => api<{ items: Product[] }>('products').then((r) => r.items));
  const groups = useLoad(() => api<{ items: Group[] }>('modifier-groups').then((r) => r.items));
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [editGroup, setEditGroup] = useState<Partial<Group> | null>(null);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'hidden' | 'low'>('all');
  const writable = can('catalog.write');
  const cur = me.tenant.currency;

  useEffect(() => {
    if (params.get('new') === '1' && writable && cats.data) {
      setEditProduct({ active: true, categoryId: cats.data[0]?._id });
      router.replace('/menu');
    }
    if (params.get('import') === '1' && writable) {
      setImporting(true);
      router.replace('/menu');
    }
  }, [params, writable, cats.data, router]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: 'name' | 'category' | 'price' | 'stock'; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [page, setPage] = useState(1);
  const catName = useMemo(() => new Map((cats.data ?? []).map((c) => [c._id, c.name])), [cats.data]);
  const filtered = (prods.data ?? []).filter((p) =>
    (!catFilter || p.categoryId === catFilter) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase())) &&
    (status === 'all' || (status === 'active' && p.active) || (status === 'hidden' && !p.active) || (status === 'low' && typeof p.stock === 'number' && p.stock <= 5)),
  );

  const sorted = [...filtered].sort((a, b) => {
    const val = (p: Product): string | number =>
      sort.key === 'name' ? p.name.toLowerCase() : sort.key === 'category' ? (catName.get(p.categoryId ?? '') ?? '~').toLowerCase()
        : sort.key === 'price' ? p.basePrice : typeof p.stock === 'number' ? p.stock : Number.MAX_SAFE_INTEGER;
    const x = val(a);
    const y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
  });
  const PAGE = 25;
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const pageItems = sorted.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  useEffect(() => setPage(1), [q, catFilter, status, sort]);

  /** Bulk show/hide/move/delete with Undo for show/hide (skill rule: undo for bulk changes). */
  async function bulk(action: 'show' | 'hide' | 'delete' | 'move', categoryId?: string, only?: string[]) {
    const ids = only ?? [...selected];
    if (!ids.length) return;
    const noun = ids.length === 1 ? v.item.toLowerCase() : v.items.toLowerCase();
    if (action === 'delete' && !(await dialog.confirm({
      title: `Delete ${ids.length} ${noun}?`, message: "This can't be undone. Past orders keep their details.", confirmLabel: 'Delete', danger: true,
    }))) return;
    const before = new Map((prods.data ?? []).filter((p) => ids.includes(p._id)).map((p) => [p._id, p]));
    try {
      const r = await api<{ affected: number }>('products/bulk', { method: 'POST', body: { ids, action, ...(categoryId ? { categoryId } : {}) } });
      setSelected(new Set());
      await prods.reload();
      const verb = action === 'show' ? 'shown' : action === 'hide' ? 'hidden' : action === 'move' ? 'moved' : 'deleted';
      const undo = action === 'show' || action === 'hide' ? {
        label: 'Undo',
        onClick: async () => {
          const wasVisible = [...before.values()].filter((p) => p.active).map((p) => p._id);
          const wasHidden = [...before.values()].filter((p) => !p.active).map((p) => p._id);
          if (wasVisible.length) await api('products/bulk', { method: 'POST', body: { ids: wasVisible, action: 'show' } });
          if (wasHidden.length) await api('products/bulk', { method: 'POST', body: { ids: wasHidden, action: 'hide' } });
          prods.reload();
        },
      } : undefined;
      toast(`${r.affected} ${r.affected === 1 ? v.item.toLowerCase() : v.items.toLowerCase()} ${verb}`, 'ok', undo);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function quickToggle(p: Product, active: boolean) {
    prods.setData((list) => list?.map((x) => (x._id === p._id ? { ...x, active } : x)) ?? null);
    try {
      await api(`products/${p._id}`, { method: 'PATCH', body: { active } });
    } catch (e) {
      toast((e as Error).message, 'error');
      prods.reload();
    }
  }

  async function moveCat(idx: number, dir: -1 | 1) {
    const list = [...(cats.data ?? [])];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    cats.setData(list);
    try {
      await api('categories/reorder', { method: 'POST', body: { ids: list.map((c) => c._id) } });
    } catch (e) {
      toast((e as Error).message, 'error');
      cats.reload();
    }
  }

  async function duplicate(p: Product) {
    try {
      const { _id: _ignore, sort: _s, ...rest } = p as Product & Record<string, unknown>;
      const body = {
        name: `${p.name} (copy)`, slug: `${p.slug}-copy-${Date.now().toString(36).slice(-4)}`, description: p.description, categoryId: p.categoryId,
        basePrice: p.basePrice, images: p.images, tags: p.tags, modifierGroupIds: p.modifierGroupIds, active: false,
        variants: (p.variants ?? []).map(({ name, price }) => ({ name, price })), ...(typeof p.stock === 'number' ? { stock: p.stock } : {}),
      };
      void rest;
      await api('products', { method: 'POST', body });
      toast(`Duplicated as a hidden ${v.item.toLowerCase()}`);
      prods.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const priceLabel = (p: Product) => {
    if (!p.variants?.length) return money(p.basePrice, cur);
    const prices = p.variants.map((x) => x.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    return lo === hi ? money(lo, cur) : `${money(lo, cur)} – ${money(hi, cur)}`;
  };

  return (
    <div className="content">
      <PageHeader
        title={v.catalog === 'Menu' ? 'Menu' : v.items}
        description={`Everything customers can ${v.orderVerb.toLowerCase()} on your website.`}
        actions={writable && (
          <>
            {tab === 'items' && (
              <>
                <a className="btn btn-secondary" href="/api/proxy/products/export.csv"><Download size={15} /> Export</a>
                <button className="btn btn-secondary" onClick={() => setImporting(true)}><Upload size={15} /> Import</button>
                <button className="btn" onClick={() => setEditProduct({ active: true, categoryId: catFilter || cats.data?.[0]?._id })}><Plus size={15} /> Add {v.item.toLowerCase()}</button>
              </>
            )}
            {tab === 'categories' && <button className="btn" onClick={() => setEditCat({ visible: true })}><Plus size={15} /> Add {v.category.toLowerCase()}</button>}
            {tab === 'options' && <button className="btn" onClick={() => setEditGroup({ min: 0, max: 1, options: [{ name: '', price: 0 }] })}><Plus size={15} /> Add option group</button>}
          </>
        )}
      />
      <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
        {(['items', 'categories', 'options'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'items' ? `${v.items} (${prods.data?.length ?? 0})` : t === 'categories' ? `${v.categories} (${cats.data?.length ?? 0})` : `${v.options} (${groups.data?.length ?? 0})`}
          </button>
        ))}
      </div>
      <ErrorBox error={prods.error || cats.error || groups.error} />

      {tab === 'items' && (
        <div className="card flush">
          <div className="toolbar">
            <div className="input-icon" style={{ flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={15} />
              <input className="input" placeholder={`Search ${v.items.toLowerCase()}`} aria-label={`Search ${v.items}`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="select" style={{ maxWidth: 200 }} aria-label={`Filter by ${v.category}`} value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">All {v.categories.toLowerCase()}</option>
              {cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <div className="seg" role="group" aria-label="Status filter">
              {(['all', 'active', 'hidden', 'low'] as const).map((s) => (
                <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'all' ? 'All' : s === 'active' ? 'Visible' : s === 'hidden' ? 'Hidden' : 'Low stock'}</button>
              ))}
            </div>
          </div>
          {prods.loading && !prods.data ? <SkeletonRows /> : filtered.length === 0 ? (
            <EmptyState icon={<Package size={22} />} title={prods.data?.length ? 'No matches' : `No ${v.items.toLowerCase()} yet`}
              text={prods.data?.length ? 'Try a different search or filter.' : v.emptyCatalog}
              action={writable && !prods.data?.length && <button className="btn" onClick={() => setEditProduct({ active: true })}><Plus size={15} /> Add {v.item.toLowerCase()}</button>} />
          ) : (
            <>
              {selected.size > 0 && (
                <div className="bulk-bar" role="region" aria-label="Bulk actions">
                  <span>{selected.size} selected</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => bulk('show')}><Eye size={14} /> Show</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => bulk('hide')}><EyeOff size={14} /> Hide</button>
                  <select className="select" style={{ width: 200, height: 30 }} aria-label={`Move to ${v.category.toLowerCase()}`} value=""
                    onChange={(e) => e.target.value && bulk('move', e.target.value)}>
                    <option value="">Move to {v.category.toLowerCase()}…</option>
                    {cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                  <button className="btn btn-danger btn-sm" onClick={() => bulk('delete')}><Trash2 size={14} /> Delete</button>
                  <span className="spacer" />
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
              )}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {writable && (
                        <th style={{ width: 36 }}>
                          <input type="checkbox" className="cbx" aria-label="Select all on this page"
                            checked={pageItems.length > 0 && pageItems.every((p) => selected.has(p._id))}
                            onChange={(e) => setSelected((cur) => {
                              const n = new Set(cur);
                              pageItems.forEach((p) => (e.target.checked ? n.add(p._id) : n.delete(p._id)));
                              return n;
                            })} />
                        </th>
                      )}
                      {([['name', v.item], ['category', v.category], ['price', 'Price'], ['stock', 'Stock']] as const).map(([k, label]) => (
                        <th key={k} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" className="th-sort" onClick={() => setSort((x) => ({ key: k, dir: x.key === k ? (x.dir === 1 ? -1 : 1) : 1 }))}>
                            {label}{sort.key === k ? (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={13} style={{ opacity: .4 }} />}
                          </button>
                        </th>
                      ))}
                      <th>Visible</th>
                      <th><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((p) => (
                      <tr key={p._id} className="clickable" onClick={() => writable && setEditProduct(p)}>
                        {writable && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="cbx" aria-label={`Select ${p.name}`} checked={selected.has(p._id)}
                              onChange={(e) => setSelected((cur) => { const n = new Set(cur); if (e.target.checked) n.add(p._id); else n.delete(p._id); return n; })} />
                          </td>
                        )}
                        <td>
                          <div className="row nowrap">
                            <div className="thumb">{p.images?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.images[0]} alt="" loading="lazy" />
                            ) : <ImageIcon size={16} />}</div>
                            <div style={{ minWidth: 0 }}>
                              <div className="strong">{p.name}</div>
                              <div className="small muted">
                                {p.variants?.length ? `${p.variants.length} variants` : ''}
                                {p.variants?.length && p.tags?.length ? ' · ' : ''}
                                {p.tags?.join(', ')}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="muted">{p.categoryId ? catName.get(p.categoryId) : '—'}</td>
                        <td className="nowrap">{priceLabel(p)}</td>
                        <td>{typeof p.stock === 'number' ? (p.stock === 0 ? <span className="pill danger">Sold out</span> : p.stock <= 5 ? <span className="pill warn">{p.stock} left</span> : p.stock) : <span className="faint">Not tracked</span>}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <Switch label={`${p.name} visible`} checked={p.active} disabled={!writable} onChange={(val) => quickToggle(p, val)} />
                        </td>
                        <td className="right" onClick={(e) => e.stopPropagation()}>
                          {writable && (
                            <ActionMenu label={`Actions for ${p.name}`} items={[
                              { label: 'Edit', icon: <Pencil size={14} />, onClick: () => setEditProduct(p) },
                              { label: 'Duplicate', icon: <Copy size={14} />, onClick: () => duplicate(p) },
                              { label: p.active ? 'Hide from store' : 'Show on store', icon: p.active ? <EyeOff size={14} /> : <Eye size={14} />, onClick: () => quickToggle(p, !p.active) },
                              { label: 'Delete', icon: <Trash2 size={14} />, danger: true, onClick: () => { setSelected(new Set([p._id])); void bulk('delete', undefined, [p._id]); } },
                            ]} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="pager">
                  <span className="small muted">{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, sorted.length)} of {sorted.length}</span>
                  <span className="spacer" />
                  <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                  <button className="btn btn-secondary btn-sm" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'categories' && (
        <div className="card flush">
          {cats.data?.length === 0 ? (
            <EmptyState icon={<Layers size={22} />} title={`No ${v.categories.toLowerCase()} yet`} text={`${v.categories} group your ${v.items.toLowerCase()} so customers find things fast.`}
              action={writable && <button className="btn" onClick={() => setEditCat({ visible: true })}><Plus size={15} /> Add {v.category.toLowerCase()}</button>} />
          ) : (
            <table className="table">
              <thead><tr><th style={{ width: 90 }}>Order</th><th>{v.category}</th><th>{v.items}</th><th>Visible</th><th /></tr></thead>
              <tbody>
                {cats.data?.map((c, i) => (
                  <tr key={c._id}>
                    <td className="nowrap">
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Move ${c.name} up`} disabled={!writable || i === 0} onClick={() => moveCat(i, -1)}><ArrowUp size={15} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label={`Move ${c.name} down`} disabled={!writable || i === (cats.data?.length ?? 0) - 1} onClick={() => moveCat(i, 1)}><ArrowDown size={15} /></button>
                    </td>
                    <td>
                      <div className="row nowrap">
                        <div className="thumb">{c.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.image} alt="" />
                        ) : <Layers size={16} />}</div>
                        <span className="strong">{c.name}</span>
                      </div>
                    </td>
                    <td className="muted">{prods.data?.filter((p) => p.categoryId === c._id).length ?? 0}</td>
                    <td>{c.visible ? <span className="pill ok">Visible</span> : <span className="pill">Hidden</span>}</td>
                    <td className="right">{writable && <button className="btn btn-secondary btn-sm" onClick={() => setEditCat(c)}>Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'options' && (
        groups.data?.length === 0 ? (
          <div className="card"><EmptyState icon={<SlidersHorizontal size={22} />} title={`No ${v.options.toLowerCase()} yet`}
            text={`${v.options} are choices customers make on a ${v.item.toLowerCase()}, like size, gift wrap or extras. Variants with their own price (size, colour, weight) are set on each ${v.item.toLowerCase()} instead.`}
            action={writable && <button className="btn" onClick={() => setEditGroup({ min: 0, max: 1, options: [{ name: '', price: 0 }] })}><Plus size={15} /> Add option group</button>} /></div>
        ) : (
          <div className="grid grid-2">
            {groups.data?.map((g) => (
              <div key={g._id} className="card">
                <div className="card-head">
                  <h2>{g.name}</h2>
                  <span className="pill">{g.min === 0 ? 'Optional' : `Required · choose ${g.min}`}{g.max > 1 ? ` · up to ${g.max}` : ''}</span>
                  <span className="spacer" />
                  {writable && <button className="btn btn-secondary btn-sm" onClick={() => setEditGroup(g)}>Edit</button>}
                </div>
                <div className="row">{g.options.map((o) => <span key={o.name} className="pill">{o.name}{o.price ? ` +${o.price}` : ''}</span>)}</div>
                <p className="small muted" style={{ margin: '10px 0 0' }}>Used by {prods.data?.filter((p) => p.modifierGroupIds?.includes(g._id)).length ?? 0} {v.items.toLowerCase()}</p>
              </div>
            ))}
          </div>
        )
      )}

      {editProduct && (
        <ProductEditor initial={editProduct} categories={cats.data ?? []} groups={groups.data ?? []} onClose={() => setEditProduct(null)}
          onSaved={(msg) => { setEditProduct(null); prods.reload(); toast(msg); }} confirmDelete={(name) => dialog.confirm({ title: `Delete ${name}?`, message: "This can't be undone. Past orders keep their details.", confirmLabel: 'Delete', danger: true })} />
      )}
      {editCat && <CategoryForm initial={editCat} onClose={() => setEditCat(null)} onSaved={() => { setEditCat(null); cats.reload(); toast(`${v.category} saved`); }}
        confirmDelete={(name) => dialog.confirm({ title: `Delete ${name}?`, message: `${v.items} in it stay on your store without a ${v.category.toLowerCase()}.`, confirmLabel: 'Delete', danger: true })} />}
      {editGroup && <GroupForm initial={editGroup} onClose={() => setEditGroup(null)} onSaved={() => { setEditGroup(null); groups.reload(); toast('Options saved'); }}
        confirmDelete={(name) => dialog.confirm({ title: `Delete ${name}?`, confirmLabel: 'Delete', danger: true })} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => { prods.reload(); cats.reload(); }} />}
    </div>
  );
}

export default function CatalogPage() {
  return <Suspense fallback={<div className="content"><SkeletonRows /></div>}><CatalogInner /></Suspense>;
}

function ProductEditor({ initial, categories, groups, onClose, onSaved, confirmDelete }: {
  initial: Partial<Product>; categories: Category[]; groups: Group[]; onClose: () => void; onSaved: (msg: string) => void; confirmDelete: (name: string) => Promise<boolean>;
}) {
  const { v, me } = useMe();
  const [f, setF] = useState({
    name: initial.name ?? '', slug: initial.slug ?? '', description: initial.description ?? '', categoryId: initial.categoryId ?? '',
    basePrice: initial.basePrice === undefined ? '' : String(initial.basePrice), images: initial.images ?? [], tags: (initial.tags ?? []).join(', '),
    modifierGroupIds: initial.modifierGroupIds ?? [], active: initial.active ?? true,
    trackStock: typeof initial.stock === 'number', stock: String(initial.stock ?? ''),
    variants: (initial.variants ?? []).map((x) => ({ name: x.name, price: String(x.price) })),
  });
  const [error, setError] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isNew = !initial._id;
  const hasVariants = f.variants.length > 0;

  /** Client-side checks, run on blur and before saving. */
  const check = (field: 'name' | 'basePrice', val: typeof f = f) => {
    if (field === 'name') return val.name.trim() ? '' : `Give your ${v.item.toLowerCase()} a name`;
    if (val.variants.length) return '';
    return val.basePrice.trim() === '' ? 'Enter a price (0 if free)' : Number(val.basePrice) < 0 ? "Price can't be negative" : '';
  };
  const blur = (field: 'name' | 'basePrice') => setErrs((x) => ({ ...x, [field]: check(field) }));

  async function save() {
    const local = { name: check('name'), basePrice: check('basePrice') };
    if (local.name || local.basePrice) {
      setErrs(local);
      document.getElementById(local.name ? 'p-name' : 'p-price')?.focus();
      return;
    }
    setBusy(true);
    setError('');
    setErrs({});
    const variants = f.variants.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), price: Number(x.price) || 0 }));
    const basePrice = variants.length ? Math.min(...variants.map((x) => x.price)) : Number(f.basePrice);
    const body: Record<string, unknown> = {
      name: f.name.trim(), slug: f.slug || slugify(f.name), description: f.description || undefined, basePrice, images: f.images.filter(Boolean),
      tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), modifierGroupIds: f.modifierGroupIds, active: f.active, variants,
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.trackStock ? { stock: Math.max(0, Math.floor(Number(f.stock) || 0)) } : {}),
    };
    try {
      if (isNew) await api('products', { method: 'POST', body });
      else await api(`products/${initial._id}`, { method: 'PATCH', body });
      onSaved(`${f.name} saved`);
    } catch (e) {
      // Show API validation errors next to the field they belong to; keep what was typed.
      const fe = fieldErrors(e);
      if ((e as { status?: number }).status === 409) fe.name = `A ${v.item.toLowerCase()} with this name already exists`;
      if (fe.slug && !fe.name) fe.name = fe.slug;
      if (Object.keys(fe).length) {
        setErrs(fe);
        document.getElementById(fe.name ? 'p-name' : 'p-price')?.focus();
        if (!fe.name && !fe.basePrice) setError((e as Error).message);
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirmDelete(initial.name ?? v.item))) return;
    try {
      await api(`products/${initial._id}`, { method: 'DELETE' });
      onSaved(`${initial.name} deleted`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const setVariant = (i: number, patch: Partial<{ name: string; price: string }>) =>
    setF({ ...f, variants: f.variants.map((x, k) => (k === i ? { ...x, ...patch } : x)) });

  return (
    <Drawer title={isNew ? `New ${v.item.toLowerCase()}` : f.name || v.item} onClose={onClose}
      actions={!isNew && <button className="btn btn-ghost btn-icon btn-sm" onClick={remove} aria-label="Delete" title="Delete"><Trash2 size={16} /></button>}>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Name" htmlFor="p-name" required error={errs.name}>
          <input id="p-name" className="input" maxLength={160} autoFocus value={f.name} onBlur={() => blur('name')}
            onChange={(e) => { setF({ ...f, name: e.target.value, slug: isNew ? slugify(e.target.value) : f.slug }); if (errs.name) setErrs((x) => ({ ...x, name: '' })); }} />
        </Field>
        <ImageUploader label="Photo" value={f.images[0]} onChange={(url) => setF({ ...f, images: url ? [url, ...f.images.slice(1)] : f.images.slice(1) })} hint="Square photos look best." />
        <Field label="Description" htmlFor="p-desc">
          <textarea id="p-desc" className="textarea" maxLength={4000} placeholder={`What makes this ${v.item.toLowerCase()} special?`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label={v.category} htmlFor="p-cat">
            <select id="p-cat" className="select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">None</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </Field>
          {!hasVariants && (
            <Field label="Price" htmlFor="p-price" required error={errs.basePrice}>
              <div className="input-group"><span className="addon">{me.tenant.currency === 'PKR' ? 'Rs.' : me.tenant.currency}</span>
                <input id="p-price" className="input" type="number" min={0} step={1} inputMode="numeric" value={f.basePrice} onBlur={() => blur('basePrice')}
                  aria-invalid={errs.basePrice ? true : undefined} aria-describedby={errs.basePrice ? 'p-price-msg' : undefined}
                  onChange={(e) => { setF({ ...f, basePrice: e.target.value }); if (errs.basePrice) setErrs((x) => ({ ...x, basePrice: '' })); }} /></div>
            </Field>
          )}
        </div>

        <div className="card" style={{ padding: 14, background: 'var(--subtle)' }}>
          <div className="row" style={{ marginBottom: hasVariants ? 10 : 0 }}>
            <div style={{ flex: 1 }}>
              <div className="strong">Variants</div>
              <div className="small muted">Sizes, colours or weights, each with its own price.</div>
            </div>
            {!hasVariants && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setF({ ...f, variants: [{ name: '', price: f.basePrice || '0' }, { name: '', price: f.basePrice || '0' }] })}><Plus size={14} /> Add variants</button>}
          </div>
          {f.variants.map((x, i) => (
            <div key={i} className="row nowrap" style={{ marginBottom: 6 }}>
              <input className="input" placeholder={i === 0 ? 'e.g. Small' : 'e.g. Large'} aria-label={`Variant ${i + 1} name`} value={x.name} onChange={(e) => setVariant(i, { name: e.target.value })} />
              <input className="input" style={{ width: 130 }} type="number" min={0} aria-label={`Variant ${i + 1} price`} value={x.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove variant" onClick={() => setF({ ...f, variants: f.variants.filter((_, k) => k !== i) })}><Trash2 size={15} /></button>
            </div>
          ))}
          {hasVariants && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, variants: [...f.variants, { name: '', price: f.variants[f.variants.length - 1]?.price ?? '0' }] })}><Plus size={14} /> Add another</button>}
        </div>

        {groups.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>{v.options}</div>
            <div className="row">
              {groups.map((g) => (
                <label key={g._id} className="checkbox pill" style={{ padding: '4px 10px' }}>
                  <input type="checkbox" checked={f.modifierGroupIds.includes(g._id)}
                    onChange={(e) => setF({ ...f, modifierGroupIds: e.target.checked ? [...f.modifierGroupIds, g._id] : f.modifierGroupIds.filter((x) => x !== g._id) })} />
                  {g.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <Field label="Tags" htmlFor="p-tags" hint='Comma separated. "popular" and "new" feature the item on your home page.'>
          <input id="p-tags" className="input" placeholder="popular, new" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </Field>
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={f.trackStock} onChange={(e) => setF({ ...f, trackStock: e.target.checked })} /> Track stock</label>
          {f.trackStock && <input className="input" style={{ width: 120 }} type="number" min={0} aria-label="Stock count" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />}
          <span className="spacer" />
          <label className="row nowrap small">Visible on store <Switch label="Visible on store" checked={f.active} onChange={(val) => setF({ ...f, active: val })} /></label>
        </div>
        <div className="row" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <span className="spacer" />
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Drawer>
  );
}

function CategoryForm({ initial, onClose, onSaved, confirmDelete }: { initial: Partial<Category>; onClose: () => void; onSaved: () => void; confirmDelete: (n: string) => Promise<boolean> }) {
  const { v } = useMe();
  const [name, setName] = useState(initial.name ?? '');
  const [image, setImage] = useState(initial.image ?? '');
  const [visible, setVisible] = useState(initial.visible ?? true);
  const [error, setError] = useState('');
  const isNew = !initial._id;
  async function save() {
    try {
      const body = { name: name.trim(), slug: isNew ? slugify(name) : initial.slug, visible, ...(image ? { image } : {}) };
      if (isNew) await api('categories', { method: 'POST', body: { ...body, sort: 999 } });
      else await api(`categories/${initial._id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!(await confirmDelete(initial.name ?? v.category))) return;
    try {
      await api(`categories/${initial._id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={isNew ? `Add ${v.category.toLowerCase()}` : `Edit ${v.category.toLowerCase()}`} onClose={onClose} footer={
      <>
        {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!name.trim()} onClick={save}>Save</button>
      </>
    }>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Name" htmlFor="c-name"><input id="c-name" className="input" maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <ImageUploader label="Image (optional)" value={image} onChange={setImage} compact />
        <label className="checkbox"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Show on the website</label>
      </div>
    </Modal>
  );
}

function GroupForm({ initial, onClose, onSaved, confirmDelete }: { initial: Partial<Group>; onClose: () => void; onSaved: () => void; confirmDelete: (n: string) => Promise<boolean> }) {
  const [g, setG] = useState({ name: initial.name ?? '', min: initial.min ?? 0, max: initial.max ?? 1, options: initial.options ?? [] });
  const [error, setError] = useState('');
  const isNew = !initial._id;
  const required = g.min > 0;
  const setOpt = (i: number, patch: Partial<Option>) => setG({ ...g, options: g.options.map((o, k) => (k === i ? { ...o, ...patch } : o)) });

  async function save() {
    const body = {
      name: g.name.trim(), min: Number(g.min), max: Number(g.max),
      options: g.options.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), price: Number(o.price) || 0, available: o.available !== false })),
    };
    try {
      if (isNew) await api('modifier-groups', { method: 'POST', body });
      else await api(`modifier-groups/${initial._id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!(await confirmDelete(initial.name ?? 'this group'))) return;
    try {
      await api(`modifier-groups/${initial._id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={isNew ? 'New option group' : `Edit ${initial.name}`} onClose={onClose} footer={
      <>
        {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!g.name.trim() || !g.options.some((o) => o.name.trim())} onClick={save}>Save</button>
      </>
    }>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Group name" htmlFor="g-name"><input id="g-name" className="input" placeholder="e.g. Choose size, Gift options, Extras" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></Field>
        <div className="row">
          <div className="seg" role="group" aria-label="Required or optional">
            <button aria-pressed={!required} onClick={() => setG({ ...g, min: 0 })}>Optional</button>
            <button aria-pressed={required} onClick={() => setG({ ...g, min: Math.max(1, g.min) })}>Required</button>
          </div>
          <label className="row nowrap small">Customers can pick up to
            <input className="input" style={{ width: 70 }} type="number" min={1} max={20} aria-label="Maximum choices" value={g.max} onChange={(e) => setG({ ...g, max: Math.max(1, Number(e.target.value)) })} />
          </label>
        </div>
        <div className="label">Choices</div>
        {g.options.map((o, i) => (
          <div key={i} className="row nowrap">
            <input className="input" placeholder="Choice name" aria-label={`Choice ${i + 1} name`} value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} />
            <div className="input-group" style={{ width: 150, flex: '0 0 auto' }}><span className="addon">+</span><input className="input" type="number" min={0} aria-label={`Choice ${i + 1} extra price`} value={o.price} onChange={(e) => setOpt(i, { price: Number(e.target.value) })} /></div>
            <button className="btn btn-ghost btn-icon btn-sm" aria-label="Remove choice" onClick={() => setG({ ...g, options: g.options.filter((_, k) => k !== i) })}><Trash2 size={15} /></button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setG({ ...g, options: [...g.options, { name: '', price: 0 }] })}><Plus size={14} /> Add choice</button>
      </div>
    </Modal>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { v } = useMe();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errorCount: number; errors: { row: number; message: string }[] } | null>(null);
  const [error, setError] = useState('');
  const template = 'name,category,price,description,tags,stock,active,image\nClassic T-Shirt,Men,1999,Soft cotton tee,new|popular,25,yes,\n';

  async function run() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/proxy/products/import', { method: 'POST', headers: { 'Content-Type': 'text/csv', 'x-qs-csrf': '1' }, body: await file.text() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Import failed');
      setResult(body);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Import ${v.items.toLowerCase()}`} icon={<FileSpreadsheet size={18} />} onClose={onClose} footer={
      result ? <button className="btn" onClick={onClose}>Done</button> : (
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!file || busy} onClick={run}>{busy ? 'Importing…' : 'Import'}</button>
        </>
      )
    }>
      <div className="stack">
        <ErrorBox error={error} />
        {result ? (
          <>
            <div className="alert ok">Added {result.created} and updated {result.updated} {v.items.toLowerCase()}.</div>
            {result.errorCount > 0 && (
              <div className="alert warn" style={{ display: 'block' }}>
                <strong>{result.errorCount} rows skipped:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{result.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}</ul>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="muted mb-0">Upload a CSV from Excel or Google Sheets (File → Download → CSV). Rows with the same name update existing {v.items.toLowerCase()}; new {v.categories.toLowerCase()} are created automatically.</p>
            <a className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="products-template.csv"><Download size={14} /> Download template</a>
            <label className="dropzone">
              <div className="preview"><FileSpreadsheet size={22} /></div>
              <div><div className="strong">{file ? file.name : 'Choose a CSV file'}</div><div className="small muted">Columns: name, category, price, description, tags, stock, active, image</div></div>
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
