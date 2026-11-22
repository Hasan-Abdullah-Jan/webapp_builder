import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { AuditLog, Domain, Order, Plan, Product, Branch, Tenant, User, audit } from '../models';
import { runAsPlatform, runWithTenant } from '../db/tenantContext';
import { badRequest, notFound } from './errors';
import { revokeAllForUser } from './tokens';
import { bus } from './events';
import { purgeTenantCache } from './cachePurge';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function overview() {
  return runAsPlatform('platform: overview', async () => {
    const byStatus = await Tenant.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const since14 = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const signups = await Tenant.aggregate([
      { $match: { createdAt: { $gte: since14 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const since24 = new Date(Date.now() - 24 * 3600 * 1000);
    const [orders] = await Order.aggregate([
      { $match: { createdAt: { $gte: since24 }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, n: { $sum: 1 }, gmv: { $sum: '$totals.total' } } },
    ]);
    const plans = await Tenant.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$planId', n: { $sum: 1 } } }]);
    const planPrices = new Map((await Plan.find({}).lean()).map((p) => [p.key, p.pricePkr]));
    const mrr = plans.reduce((s, p) => s + (planPrices.get(p._id) ?? 0) * p.n, 0);
    const stuck = await Tenant.countDocuments({ status: 'draft', createdAt: { $lt: new Date(Date.now() - 3 * 24 * 3600 * 1000) } });
    return {
      tenantsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
      signupsLast14Days: signups.map((s) => ({ date: s._id, count: s.n })),
      last24h: { orders: orders?.n ?? 0, gmv: orders?.gmv ?? 0 },
      mrrPkr: mrr,
      stuckInDraft: stuck,
    };
  });
}

const TenantQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['draft', 'active', 'suspended', 'deleted', 'provisioning_failed']).optional(),
  plan: z.string().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().refine(isValidObjectId).optional(),
});

export async function listTenants(raw: unknown) {
  const { q, status, plan, limit, cursor } = TenantQuery.parse(raw);
  return runAsPlatform('platform: list tenants', async () => {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (plan) filter.planId = plan;
    if (cursor) filter._id = { $lt: new Types.ObjectId(cursor) };
    if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { slug: new RegExp('^' + escapeRegex(q), 'i') }];
    const items = await Tenant.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? String(page[page.length - 1]._id) : null };
  });
}

export async function tenantDetail(id: string) {
  if (!isValidObjectId(id)) throw notFound('Tenant');
  const tenantId = new Types.ObjectId(id);
  const tenant = await runAsPlatform('platform: tenant detail', () => Tenant.findOne({ _id: tenantId }).lean());
  if (!tenant) throw notFound('Tenant');
  const [domains, auditTrail] = await runAsPlatform('platform: tenant extras', () =>
    Promise.all([
      Domain.find({ tenantId }).lean(),
      AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(30).lean(),
    ]),
  );
  // Usage is read inside the tenant's own scope.
  const usage = await runWithTenant({ tenantId }, async () => ({
    products: await Product.countDocuments({}),
    branches: await Branch.countDocuments({}),
    staff: await User.countDocuments({}),
    orders30d: await Order.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } }),
  }));
  const owner = tenant.ownerId
    ? await runWithTenant({ tenantId }, () => User.findOne({ _id: tenant.ownerId }).select('name email phone').lean())
    : null;
  return { tenant, owner, domains, usage, audit: auditTrail };
}

const ReasonInput = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

export async function setTenantStatus(id: string, status: 'suspended' | 'active', body: unknown, actorId: Types.ObjectId) {
  if (!isValidObjectId(id)) throw notFound('Tenant');
  const { reason } = ReasonInput.parse(body);
  const tenantId = new Types.ObjectId(id);
  const from = status === 'suspended' ? ['active', 'draft'] : ['suspended'];
  const res = await runAsPlatform('platform: set tenant status', () =>
    Tenant.updateOne({ _id: tenantId, status: { $in: from } }, { $set: { status } }),
  );
  if (!res.matchedCount) throw badRequest(`Store can't be ${status === 'suspended' ? 'suspended' : 'reactivated'} from its current status`);
  if (status === 'suspended') {
    const staff = await runWithTenant({ tenantId }, () => User.find({}).select('_id').lean());
    for (const u of staff) await revokeAllForUser(u._id);
  }
  await audit({ tenantId, actorType: 'platform', actorId, action: `tenant.${status === 'suspended' ? 'suspend' : 'reactivate'}`, meta: { reason } });
  await purgeTenantCache(tenantId);
  bus.emitEvent('tenant.status_changed', { tenantId: String(tenantId), status });
  return { status };
}

const PlanChange = z.object({ planId: z.string().max(30), reason: z.string().trim().max(300).optional() }).strict();

export async function changePlan(id: string, body: unknown, actorId: Types.ObjectId) {
  if (!isValidObjectId(id)) throw notFound('Tenant');
  const { planId, reason } = PlanChange.parse(body);
  const tenantId = new Types.ObjectId(id);
  return runAsPlatform('platform: change plan', async () => {
    if (!(await Plan.exists({ key: planId }))) throw badRequest('Unknown plan');
    const res = await Tenant.updateOne({ _id: tenantId }, { $set: { planId } });
    if (!res.matchedCount) throw notFound('Tenant');
    await audit({ tenantId, actorType: 'platform', actorId, action: 'tenant.plan_change', target: planId, meta: { reason } });
    return { planId };
  });
}

const ExtendTrial = z.object({ days: z.number().int().min(1).max(90) }).strict();

export async function extendTrial(id: string, body: unknown, actorId: Types.ObjectId) {
  if (!isValidObjectId(id)) throw notFound('Tenant');
  const { days } = ExtendTrial.parse(body);
  const tenantId = new Types.ObjectId(id);
  return runAsPlatform('platform: extend trial', async () => {
    const t = await Tenant.findOne({ _id: tenantId }).select('trialEndsAt').lean();
    if (!t) throw notFound('Tenant');
    const base = t.trialEndsAt && t.trialEndsAt > new Date() ? t.trialEndsAt : new Date();
    const trialEndsAt = new Date(base.getTime() + days * 24 * 3600 * 1000);
    await Tenant.updateOne({ _id: tenantId }, { $set: { trialEndsAt } });
    await audit({ tenantId, actorType: 'platform', actorId, action: 'tenant.extend_trial', meta: { days } });
    return { trialEndsAt };
  });
}

export async function listPlans() {
  return runAsPlatform('platform: plans', () => Plan.find({}).sort({ rank: 1, pricePkr: 1 }).lean());
}

const PlanUpdate = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    pricePkr: z.number().int().min(0).max(10_000_000).optional(),
    active: z.boolean().optional(),
    limits: z
      .object({
        products: z.number().int().min(-1),
        branches: z.number().int().min(-1),
        staff: z.number().int().min(-1),
        ordersPerMonth: z.number().int().min(-1),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

export async function updatePlan(key: string, body: unknown, actorId: Types.ObjectId) {
  const data = PlanUpdate.parse(body);
  const $set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'limits') for (const [lk, lv] of Object.entries(v as object)) $set[`limits.${lk}`] = lv;
    else $set[k] = v;
  }
  return runAsPlatform('platform: update plan', async () => {
    const plan = await Plan.findOneAndUpdate({ key }, { $set }, { new: true }).lean();
    if (!plan) throw notFound('Plan');
    await audit({ actorType: 'platform', actorId, action: 'plan.update', target: key, meta: data });
    return plan;
  });
}

export async function platformAudit(limit = 100) {
  return runAsPlatform('platform: audit', () => AuditLog.find({}).sort({ createdAt: -1 }).limit(Math.min(limit, 500)).lean());
}
