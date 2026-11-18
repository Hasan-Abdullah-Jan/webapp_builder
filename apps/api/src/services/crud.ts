import { isValidObjectId, Types, type Model } from 'mongoose';
import { z } from 'zod';
import { requireTenantId } from '../db/tenantContext';
import { notFound } from './errors';

/**
 * Generic CRUD for tenant-scoped models. Every call:
 *  - requires a tenant context (requireTenantId) — defence in depth on top of the plugin;
 *  - validates input with a STRICT Zod schema, so `tenantId`, `_id` and unknown keys are rejected;
 *  - treats other tenants' ids exactly like missing ids (404), never 403, to avoid leaking existence.
 */
export interface CrudOptions<C extends z.ZodTypeAny, U extends z.ZodTypeAny> {
  name: string;
  createSchema: C;
  updateSchema: U;
  /** Fields that `?q=` searches (case-insensitive prefix match). */
  searchFields?: string[];
  /** Fields that may be used as exact-match `?field=value` filters. */
  filterFields?: string[];
}

export const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().refine(isValidObjectId, 'invalid cursor').optional(),
  q: z.string().trim().max(100).optional(),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createCrudService<C extends z.ZodTypeAny, U extends z.ZodTypeAny>(
  model: Model<any>,
  opts: CrudOptions<C, U>,
) {
  const toId = (id: string) => {
    if (!isValidObjectId(id)) throw notFound(opts.name);
    return new Types.ObjectId(id);
  };

  return {
    /** Cursor-paginated list, newest first. */
    async list(rawQuery: Record<string, unknown>) {
      requireTenantId();
      const { limit, cursor, q } = ListQuerySchema.parse(rawQuery);
      const filter: Record<string, unknown> = {};
      if (cursor) filter._id = { $lt: new Types.ObjectId(cursor) };
      for (const f of opts.filterFields ?? []) {
        const v = rawQuery[f];
        if (typeof v === 'string' && v.length <= 200) {
          filter[f] = isValidObjectId(v) && f.endsWith('Id') ? new Types.ObjectId(v) : v;
        }
      }
      if (q && opts.searchFields?.length) {
        const rx = new RegExp('^' + escapeRegex(q), 'i');
        filter.$or = opts.searchFields.map((f) => ({ [f]: rx }));
      }
      const items = await model.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, limit) : items;
      return { items: page, nextCursor: hasMore ? String(page[page.length - 1]._id) : null };
    },

    async get(id: string) {
      requireTenantId();
      const doc = await model.findOne({ _id: toId(id) }).lean();
      if (!doc) throw notFound(opts.name);
      return doc;
    },

    async create(body: unknown) {
      requireTenantId();
      const data = opts.createSchema.parse(body);
      const doc = await model.create(data); // plugin stamps tenantId from context
      return doc.toObject();
    },

    async update(id: string, body: unknown) {
      requireTenantId();
      const data = opts.updateSchema.parse(body) as Record<string, unknown>;
      const doc = await model
        .findOneAndUpdate({ _id: toId(id) }, { $set: data }, { new: true, runValidators: true })
        .lean();
      if (!doc) throw notFound(opts.name);
      return doc;
    },

    async remove(id: string) {
      requireTenantId();
      const res = await model.deleteOne({ _id: toId(id) });
      if (res.deletedCount === 0) throw notFound(opts.name);
      return { deleted: true };
    },
  };
}

export type CrudService = ReturnType<typeof createCrudService>;
