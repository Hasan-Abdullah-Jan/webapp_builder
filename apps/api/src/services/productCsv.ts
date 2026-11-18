import { Category, Product } from '../models';
import { requireTenantId } from '../db/tenantContext';
import { currentPlan } from './limits';
import { badRequest } from './errors';

/**
 * Bulk product import/export (plan §9 "CSV import/export").
 * Columns: name, category, price, description, tags (separated by |), stock, active, image, sku-style slug.
 */
export const CSV_HEADERS = ['name', 'category', 'price', 'description', 'tags', 'stock', 'active', 'image', 'slug'];

const cell = (v: unknown) => {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportProductsCsv() {
  requireTenantId();
  const [products, categories] = await Promise.all([Product.find({}).sort({ sort: 1, name: 1 }).lean(), Category.find({}).lean()]);
  const catName = new Map(categories.map((c) => [String(c._id), c.name]));
  const rows = products.map((p) =>
    [p.name, p.categoryId ? catName.get(String(p.categoryId)) : '', p.basePrice, p.description, (p.tags ?? []).join('|'),
      typeof p.stock === 'number' ? p.stock : '', p.active ? 'yes' : 'no', p.images?.[0] ?? '', p.slug].map(cell).join(','),
  );
  return [CSV_HEADERS.join(','), ...rows].join('\n');
}

/** Minimal RFC 4180 parser (quotes, escaped quotes, commas and newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

export async function importProductsCsv(text: unknown) {
  requireTenantId();
  if (typeof text !== 'string' || !text.trim()) throw badRequest('The file is empty');
  if (text.length > 2_000_000) throw badRequest('File too large (max 2 MB)');
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw badRequest('Add at least one product row under the header');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('name') < 0 || col('price') < 0) throw badRequest('The header must include at least "name" and "price"');
  if (rows.length > 2001) throw badRequest('Import up to 2,000 products at a time');

  const { plan } = await currentPlan();
  const limit = plan?.limits?.products ?? -1;
  let count = await Product.countDocuments({});
  const categories = await Category.find({}).lean();
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c._id]));
  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
    const name = get('name');
    // Accept "1,299", "Rs. 1299", "1299.00"; reject anything without a number.
    const priceText = get('price').replace(/rs\.?|pkr|,|\s/gi, '');
    const price = /^\d+(\.\d+)?$/.test(priceText) ? Number(priceText) : NaN;
    if (!name) {
      errors.push({ row: i + 1, message: 'Missing name' });
      continue;
    }
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ row: i + 1, message: `Invalid price for "${name}"` });
      continue;
    }
    const slug = slugify(get('slug') || name);
    if (!slug) {
      errors.push({ row: i + 1, message: `Can't make an address for "${name}"` });
      continue;
    }
    let categoryId;
    const catName = get('category');
    if (catName) {
      categoryId = catByName.get(catName.toLowerCase());
      if (!categoryId) {
        const c = await Category.create({ name: catName.slice(0, 120), slug: slugify(catName).slice(0, 80) || `c-${Date.now()}`, sort: catByName.size });
        categoryId = c._id;
        catByName.set(catName.toLowerCase(), c._id);
      }
    }
    const stockRaw = get('stock');
    const image = get('image');
    const doc: Record<string, unknown> = {
      name: name.slice(0, 160),
      basePrice: Math.round(price),
      description: get('description').slice(0, 4000) || undefined,
      tags: get('tags') ? get('tags').split('|').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 30) : [],
      active: !/^(no|false|0|hidden)$/i.test(get('active')),
      ...(categoryId ? { categoryId } : {}),
      ...(stockRaw !== '' && Number.isFinite(Number(stockRaw)) ? { stock: Math.max(0, Math.floor(Number(stockRaw))) } : {}),
      ...(image && (/^https:\/\//.test(image) || /^\/media\/[a-f0-9]{24}$/.test(image)) ? { images: [image] } : {}),
    };
    try {
      const existing = await Product.findOne({ slug }).select('_id').lean();
      if (existing) {
        await Product.updateOne({ _id: existing._id }, { $set: doc }, { runValidators: true });
        updated++;
      } else {
        if (limit >= 0 && count >= limit) {
          errors.push({ row: i + 1, message: `Plan limit of ${limit} products reached` });
          continue;
        }
        await Product.create({ ...doc, slug, sort: count });
        count++;
        created++;
      }
    } catch (err) {
      errors.push({ row: i + 1, message: (err as Error).message.slice(0, 200) });
    }
  }
  return { created, updated, errors: errors.slice(0, 50), errorCount: errors.length };
}
