'use client';

import { useMemo, useState } from 'react';
import { api, money, slugify } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { ErrorBox, Field, Modal, Switch, confirmAction, useLoad, useToast } from '@/components/ui';

interface Category { _id: string; name: string; slug: string; sort: number; visible: boolean }
interface Option { name: string; price: number; available?: boolean }
interface Group { _id: string; name: string; min: number; max: number; options: Option[] }
interface Product {
  _id: string; name: string; slug: string; description?: string; categoryId?: string; basePrice: number;
  images?: string[]; tags?: string[]; modifierGroupIds?: string[]; active: boolean; stock?: number; sort: number;
}

type Tab = 'items' | 'categories' | 'addons';

export default function MenuPage() {
  const { me, can } = useMe();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('items');
  const cats = useLoad(() => api<{ items: Category[] }>('categories').then((r) => r.items));
  const prods = useLoad(() => api<{ items: Product[] }>('products').then((r) => r.items));
  const groups = useLoad(() => api<{ items: Group[] }>('modifier-groups').then((r) => r.items));
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [editGroup, setEditGroup] = useState<Partial<Group> | null>(null);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const writable = can('catalog.write');
  const cur = me.tenant.currency;

  const catName = useMemo(() => new Map((cats.data ?? []).map((c) => [c._id, c.name])), [cats.data]);
  const filtered = (prods.data ?? []).filter(
    (p) => (!catFilter || p.categoryId === catFilter) && (!q || p.name.toLowerCase().includes(q.toLowerCase())),
  );

  async function quickToggle(p: Product, active: boolean) {
    try {
      await api(`products/${p._id}`, { method: 'PATCH', body: { active } });
      prods.setData((list) => list?.map((x) => (x._id === p._id ? { ...x, active } : x)) ?? null);
    } catch (e) {
      toast((e as Error).message, 'error');
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

  return (
    <div className="content">
      <div className="page-head">
        <h1>Menu</h1>
        <span className="spacer" />
        {writable && tab === 'items' && <button className="btn" onClick={() => setEditProduct({ active: true, basePrice: 0, categoryId: catFilter || cats.data?.[0]?._id })}>+ Add item</button>}
        {writable && tab === 'categories' && <button className="btn" onClick={() => setEditCat({ visible: true })}>+ Add category</button>}
        {writable && tab === 'addons' && <button className="btn" onClick={() => setEditGroup({ min: 0, max: 1, options: [{ name: '', price: 0 }] })}>+ Add add-on group</button>}
      </div>
      <div className="row" style={{ marginBottom: 16 }} role="tablist">
        {(['items', 'categories', 'addons'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn btn-sm ${tab === t ? '' : 'btn-secondary'}`} onClick={() => setTab(t)}>
            {t === 'items' ? `Items (${prods.data?.length ?? 0})` : t === 'categories' ? `Categories (${cats.data?.length ?? 0})` : `Add-ons (${groups.data?.length ?? 0})`}
          </button>
        ))}
      </div>
      <ErrorBox error={prods.error || cats.error || groups.error} />

      {tab === 'items' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Search items" aria-label="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select" style={{ maxWidth: 220 }} aria-label="Filter by category" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
              <option value="">All categories</option>
              {cats.data?.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>On menu</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p._id} className="clickable" onClick={() => writable && setEditProduct(p)}>
                    <td><strong>{p.name}</strong>{p.tags?.length ? <span className="muted small"> · {p.tags.join(', ')}</span> : null}</td>
                    <td className="muted">{p.categoryId ? catName.get(p.categoryId) : '—'}</td>
                    <td>{money(p.basePrice, cur)}</td>
                    <td>{typeof p.stock === 'number' ? (p.stock === 0 ? <span className="pill danger">Sold out</span> : p.stock) : <span className="muted">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Switch label={`${p.name} on menu`} checked={p.active} disabled={!writable} onChange={(v) => quickToggle(p, v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty">No items yet. Add your first item to start taking orders.</div>}
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Order</th><th>Category</th><th>Items</th><th>Visible</th><th /></tr></thead>
            <tbody>
              {cats.data?.map((c, i) => (
                <tr key={c._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" aria-label={`Move ${c.name} up`} disabled={!writable || i === 0} onClick={() => moveCat(i, -1)}>↑</button>
                    <button className="btn btn-ghost btn-sm" aria-label={`Move ${c.name} down`} disabled={!writable || i === (cats.data?.length ?? 0) - 1} onClick={() => moveCat(i, 1)}>↓</button>
                  </td>
                  <td><strong>{c.name}</strong> <span className="muted small">/{c.slug}</span></td>
                  <td className="muted">{prods.data?.filter((p) => p.categoryId === c._id).length ?? 0}</td>
                  <td>{c.visible ? <span className="pill ok">Visible</span> : <span className="pill">Hidden</span>}</td>
                  <td style={{ textAlign: 'right' }}>{writable && <button className="btn btn-secondary btn-sm" onClick={() => setEditCat(c)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cats.data?.length === 0 && <div className="empty">Categories group your items, e.g. Pizzas, Burgers, Drinks.</div>}
        </div>
      )}

      {tab === 'addons' && (
        <div className="grid grid-2">
          {groups.data?.map((g) => (
            <div key={g._id} className="card">
              <div className="row">
                <h2 style={{ margin: 0 }}>{g.name}</h2>
                <span className="pill">{g.min === 0 ? 'Optional' : `Required ${g.min}`}{g.max > 1 ? ` · up to ${g.max}` : ''}</span>
                <span className="spacer" />
                {writable && <button className="btn btn-secondary btn-sm" onClick={() => setEditGroup(g)}>Edit</button>}
              </div>
              <p className="muted small" style={{ marginBottom: 0 }}>{g.options.map((o) => `${o.name}${o.price ? ` (+${o.price})` : ''}`).join(' · ')}</p>
              <p className="small" style={{ marginBottom: 0 }}>Used by {prods.data?.filter((p) => p.modifierGroupIds?.includes(g._id)).length ?? 0} items</p>
            </div>
          ))}
          {groups.data?.length === 0 && <div className="card empty">Add-on groups are choices like “Choose size” or “Extra toppings”.</div>}
        </div>
      )}

      {editProduct && (
        <ProductForm
          initial={editProduct}
          categories={cats.data ?? []}
          groups={groups.data ?? []}
          onClose={() => setEditProduct(null)}
          onSaved={() => { setEditProduct(null); prods.reload(); toast('Item saved'); }}
        />
      )}
      {editCat && (
        <CategoryForm initial={editCat} onClose={() => setEditCat(null)} onSaved={() => { setEditCat(null); cats.reload(); toast('Category saved'); }} />
      )}
      {editGroup && (
        <GroupForm initial={editGroup} onClose={() => setEditGroup(null)} onSaved={() => { setEditGroup(null); groups.reload(); toast('Add-on group saved'); }} />
      )}
    </div>
  );
}

function ProductForm({ initial, categories, groups, onClose, onSaved }: {
  initial: Partial<Product>; categories: Category[]; groups: Group[]; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    name: initial.name ?? '', slug: initial.slug ?? '', description: initial.description ?? '', categoryId: initial.categoryId ?? '',
    basePrice: String(initial.basePrice ?? ''), image: initial.images?.[0] ?? '', tags: (initial.tags ?? []).join(', '),
    modifierGroupIds: initial.modifierGroupIds ?? [], active: initial.active ?? true,
    trackStock: typeof initial.stock === 'number', stock: String(initial.stock ?? ''),
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = !initial._id;

  async function save() {
    setBusy(true);
    setError('');
    const body: Record<string, unknown> = {
      name: f.name.trim(), slug: f.slug || slugify(f.name), description: f.description || undefined,
      basePrice: Number(f.basePrice), images: f.image ? [f.image.trim()] : [],
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), modifierGroupIds: f.modifierGroupIds, active: f.active,
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.trackStock ? { stock: Math.max(0, Math.floor(Number(f.stock) || 0)) } : {}),
    };
    try {
      if (isNew) await api('products', { method: 'POST', body });
      else await api(`products/${initial._id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmAction(`Delete “${initial.name}”? This can't be undone.`)) return;
    try {
      await api(`products/${initial._id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={isNew ? 'Add item' : `Edit ${initial.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !f.name.trim() || f.basePrice === ''} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="stack">
        <ErrorBox error={error} />
        <div className="grid grid-2">
          <Field label="Name" htmlFor="p-name"><input id="p-name" className="input" maxLength={160} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: isNew ? slugify(e.target.value) : f.slug })} /></Field>
          <Field label="Price" htmlFor="p-price">
            <div className="input-group"><span className="addon">Rs.</span><input id="p-price" className="input" type="number" min={0} step={1} value={f.basePrice} onChange={(e) => setF({ ...f, basePrice: e.target.value })} /></div>
          </Field>
        </div>
        <Field label="Description" htmlFor="p-desc"><textarea id="p-desc" className="textarea" maxLength={4000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid grid-2">
          <Field label="Category" htmlFor="p-cat">
            <select id="p-cat" className="select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Tags" htmlFor="p-tags" hint="Comma separated. “popular” shows the item in Hot Deals.">
            <input id="p-tags" className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
          </Field>
        </div>
        <Field label="Photo URL" htmlFor="p-img" hint="Paste an https:// image link. Square photos look best.">
          <input id="p-img" className="input" type="url" placeholder="https://…" value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} />
        </Field>
        {groups.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Add-on groups</div>
            <div className="row">
              {groups.map((g) => (
                <label key={g._id} className="checkbox pill" style={{ padding: '6px 10px' }}>
                  <input type="checkbox" checked={f.modifierGroupIds.includes(g._id)}
                    onChange={(e) => setF({ ...f, modifierGroupIds: e.target.checked ? [...f.modifierGroupIds, g._id] : f.modifierGroupIds.filter((x) => x !== g._id) })} />
                  {g.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="row">
          <label className="checkbox"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Show on menu</label>
          <label className="checkbox"><input type="checkbox" checked={f.trackStock} onChange={(e) => setF({ ...f, trackStock: e.target.checked })} /> Track stock</label>
          {f.trackStock && <input className="input" style={{ width: 110 }} type="number" min={0} aria-label="Stock count" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />}
        </div>
      </div>
    </Modal>
  );
}

function CategoryForm({ initial, onClose, onSaved }: { initial: Partial<Category>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial.name ?? '');
  const [visible, setVisible] = useState(initial.visible ?? true);
  const [error, setError] = useState('');
  const isNew = !initial._id;
  async function save() {
    try {
      const body = { name: name.trim(), slug: isNew ? slugify(name) : initial.slug, visible };
      if (isNew) await api('categories', { method: 'POST', body: { ...body, sort: 999 } });
      else await api(`categories/${initial._id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!confirmAction(`Delete category “${initial.name}”? Items stay on your menu without a category.`)) return;
    try {
      await api(`categories/${initial._id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={isNew ? 'Add category' : 'Edit category'} onClose={onClose} footer={
      <>
        {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!name.trim()} onClick={save}>Save</button>
      </>
    }>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Name" htmlFor="c-name"><input id="c-name" className="input" maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="checkbox"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible on the website</label>
      </div>
    </Modal>
  );
}

function GroupForm({ initial, onClose, onSaved }: { initial: Partial<Group>; onClose: () => void; onSaved: () => void }) {
  const [g, setG] = useState({ name: initial.name ?? '', min: initial.min ?? 0, max: initial.max ?? 1, options: initial.options ?? [] });
  const [error, setError] = useState('');
  const isNew = !initial._id;
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
    if (!confirmAction(`Delete “${initial.name}”?`)) return;
    try {
      await api(`modifier-groups/${initial._id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={isNew ? 'Add add-on group' : `Edit ${initial.name}`} onClose={onClose} footer={
      <>
        {!isNew && <button className="btn btn-danger" onClick={remove} style={{ marginRight: 'auto' }}>Delete</button>}
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={!g.name.trim()} onClick={save}>Save</button>
      </>
    }>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Group name" htmlFor="g-name"><input id="g-name" className="input" placeholder="e.g. Choose size" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></Field>
        <div className="grid grid-2">
          <Field label="Customer must choose at least" htmlFor="g-min" hint="0 = optional"><input id="g-min" className="input" type="number" min={0} max={20} value={g.min} onChange={(e) => setG({ ...g, min: Number(e.target.value) })} /></Field>
          <Field label="…and at most" htmlFor="g-max"><input id="g-max" className="input" type="number" min={1} max={20} value={g.max} onChange={(e) => setG({ ...g, max: Number(e.target.value) })} /></Field>
        </div>
        <div className="label">Options</div>
        {g.options.map((o, i) => (
          <div key={i} className="row">
            <input className="input" style={{ flex: 2 }} placeholder="Option name" aria-label={`Option ${i + 1} name`} value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} />
            <div className="input-group" style={{ flex: 1 }}><span className="addon">+Rs.</span><input className="input" type="number" min={0} aria-label={`Option ${i + 1} price`} value={o.price} onChange={(e) => setOpt(i, { price: Number(e.target.value) })} /></div>
            <button className="btn btn-ghost btn-sm" aria-label="Remove option" onClick={() => setG({ ...g, options: g.options.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => setG({ ...g, options: [...g.options, { name: '', price: 0 }] })}>+ Add option</button>
      </div>
    </Modal>
  );
}
