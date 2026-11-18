import { Branch, Plan, Product, Tenant, User } from '../models';
import { requireTenantId, runAsPlatform } from '../db/tenantContext';
import { AppError } from './errors';

export type LimitKey = 'products' | 'branches' | 'staff';

const COUNTERS: Record<LimitKey, () => Promise<number>> = {
  products: () => Product.countDocuments({}),
  branches: () => Branch.countDocuments({}),
  staff: () => User.countDocuments({}),
};

export async function currentPlan() {
  const tenantId = requireTenantId();
  return runAsPlatform('limits: read plan', async () => {
    const tenant = await Tenant.findOne({ _id: tenantId }).select('planId trialEndsAt').lean();
    const plan = await Plan.findOne({ key: tenant?.planId ?? 'starter' }).lean();
    return { tenant, plan };
  });
}

export async function usage() {
  const { plan } = await currentPlan();
  const out: Record<string, { used: number; limit: number }> = {};
  for (const key of Object.keys(COUNTERS) as LimitKey[]) {
    out[key] = { used: await COUNTERS[key](), limit: plan?.limits?.[key] ?? -1 };
  }
  return { plan: plan ? { key: plan.key, name: plan.name } : null, usage: out };
}

/** Plan §11.8: block creation at 100% of a plan limit. Counted from MongoDB (Redis counters later). */
export async function assertWithinLimit(key: LimitKey) {
  const { plan } = await currentPlan();
  const limit = plan?.limits?.[key] ?? -1;
  if (limit < 0) return;
  const used = await COUNTERS[key]();
  if (used >= limit) {
    throw new AppError(402, 'PLAN_LIMIT', `Your ${plan?.name ?? ''} plan allows ${limit} ${key}. Upgrade to add more.`, {
      key, limit, used,
    });
  }
}
