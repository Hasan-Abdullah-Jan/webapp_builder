import { Schema, Types, type Query, type Aggregate, type Document } from 'mongoose';
import { getTenantContext, isPlatformScope, TenantScopeError } from '../tenantContext';

/**
 * Enforces "tenantId on every document" isolation (plan §4.1):
 *  - adds a required, immutable `tenantId` to the schema;
 *  - injects `{ tenantId }` into every find / update / delete / count / distinct;
 *  - prepends `$match: { tenantId }` to every aggregate;
 *  - stamps tenantId on create and refuses writes to another tenant's documents;
 *  - THROWS when there is no tenant context, unless running in explicit platform scope.
 *
 * Compound indexes on tenant models must start with `tenantId`.
 */

const QUERY_OPS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
] as const;

function currentTenantId(op: string): Types.ObjectId | null {
  const ctx = getTenantContext();
  if (ctx) return ctx.tenantId;
  if (isPlatformScope()) return null; // explicit, audited cross-tenant access
  throw new TenantScopeError(`Refused ${op}: no tenant context`);
}

export function tenantScopePlugin(schema: Schema): void {
  schema.add({
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
  });

  // ---- Queries -------------------------------------------------------------
  for (const op of QUERY_OPS) {
    schema.pre(op as any, function (this: Query<unknown, unknown>) {
      const tenantId = currentTenantId(op);
      // `where` overwrites any tenantId the caller passed, so a filter can never
      // widen or switch tenants.
      if (tenantId) this.where({ tenantId });
    });
  }

  // estimatedDocumentCount cannot be filtered, so it would leak cross-tenant counts.
  schema.pre('estimatedDocumentCount', function () {
    if (!isPlatformScope()) {
      throw new TenantScopeError('estimatedDocumentCount is not allowed on tenant collections; use countDocuments');
    }
  });

  // ---- Aggregations --------------------------------------------------------
  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    const tenantId = currentTenantId('aggregate');
    if (!tenantId) return;
    const pipeline = this.pipeline() as Record<string, any>[];
    const first = pipeline[0];
    if (first && first.$geoNear) {
      // $geoNear must stay the first stage; scope it through its own query.
      first.$geoNear.query = { ...(first.$geoNear.query ?? {}), tenantId };
    } else {
      pipeline.unshift({ $match: { tenantId } });
    }
    // Stages that read or write other collections bypass middleware, so scope or forbid them.
    for (const stage of pipeline) {
      if (stage.$unionWith || stage.$graphLookup || stage.$out || stage.$merge) {
        throw new TenantScopeError(
          '$unionWith/$graphLookup/$out/$merge are not allowed in tenant-scoped aggregates',
        );
      }
      if (stage.$lookup) {
        // Joined collection must also be tenant-scoped (MongoDB 5.0+ allows
        // localField/foreignField together with a sub-pipeline).
        stage.$lookup.pipeline = [{ $match: { tenantId } }, ...(stage.$lookup.pipeline ?? [])];
      }
    }
  });

  // ---- Document writes -----------------------------------------------------
  schema.pre('validate', function (this: Document & { tenantId?: Types.ObjectId }) {
    const tenantId = currentTenantId('save');
    if (!tenantId) {
      if (!this.tenantId) throw new TenantScopeError('Platform-scope writes must set tenantId explicitly');
      return;
    }
    if (this.isNew && !this.tenantId) this.tenantId = tenantId;
    if (!this.tenantId || !this.tenantId.equals(tenantId)) {
      throw new TenantScopeError('Refused write: document belongs to another tenant');
    }
  });

  schema.pre('deleteOne', { document: true, query: false }, function (this: Document & { tenantId?: Types.ObjectId }) {
    const tenantId = currentTenantId('deleteOne');
    if (tenantId && !this.tenantId?.equals(tenantId)) {
      throw new TenantScopeError('Refused delete: document belongs to another tenant');
    }
  });

  schema.pre('insertMany', function (next: (err?: Error) => void, docs: any[]) {
    try {
      const tenantId = currentTenantId('insertMany');
      for (const doc of Array.isArray(docs) ? docs : [docs]) {
        if (!tenantId) {
          if (!doc.tenantId) throw new TenantScopeError('Platform-scope inserts must set tenantId explicitly');
          continue;
        }
        if (doc.tenantId && !new Types.ObjectId(String(doc.tenantId)).equals(tenantId)) {
          throw new TenantScopeError('Refused insert: document belongs to another tenant');
        }
        doc.tenantId = tenantId;
      }
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  // bulkWrite bypasses per-operation filters; only platform jobs may use it.
  schema.pre('bulkWrite', function () {
    if (!isPlatformScope()) {
      throw new TenantScopeError('bulkWrite is only allowed in platform scope on tenant collections');
    }
  });
}
