import { AsyncLocalStorage } from 'node:async_hooks';
import { Types } from 'mongoose';

export interface TenantContext {
  /** Tenant the current request acts on. Comes ONLY from a verified token or resolved hostname. */
  tenantId: Types.ObjectId;
  userId?: Types.ObjectId;
  role?: string;
}

interface Store {
  tenant?: TenantContext;
  /** Platform scope: explicit, audited bypass for Super Admin/platform jobs. */
  platform?: { reason: string };
}

const storage = new AsyncLocalStorage<Store>();

/**
 * Runs `fn` inside a tenant context. The result is awaited INSIDE the context, so
 * lazily-executed Mongoose queries/aggregates returned from `fn` stay scoped.
 */
export function runWithTenant<T>(ctx: TenantContext, fn: () => T): Promise<Awaited<T>> {
  return storage.run({ tenant: ctx }, async (): Promise<Awaited<T>> => await (fn() as Awaited<T>));
}

/**
 * Run code that legitimately needs cross-tenant access (provisioning, platform admin,
 * workers). A reason is required so call sites are greppable and auditable.
 */
export function runAsPlatform<T>(reason: string, fn: () => T): Promise<Awaited<T>> {
  if (!reason) throw new Error('runAsPlatform requires a reason');
  return storage.run({ platform: { reason } }, async (): Promise<Awaited<T>> => await (fn() as Awaited<T>));
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore()?.tenant;
}

export function isPlatformScope(): boolean {
  return Boolean(storage.getStore()?.platform);
}

export function requireTenantId(): Types.ObjectId {
  const ctx = getTenantContext();
  if (!ctx) throw new TenantScopeError('No tenant context: tenant-scoped query refused');
  return ctx.tenantId;
}

export class TenantScopeError extends Error {
  readonly code = 'TENANT_SCOPE_REQUIRED';
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}
