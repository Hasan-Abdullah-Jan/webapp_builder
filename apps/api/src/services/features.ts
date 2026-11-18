import { SiteConfig } from '../models';
import { requireTenantId } from '../db/tenantContext';
import { FEATURES, FEATURE_MAP, dependenciesOf, dependentsOf, planAllows } from '../catalog/features';
import { currentPlan } from './limits';
import { AppError, badRequest, notFound } from './errors';

/** Catalogue merged with this tenant's draft flags and plan entitlement. */
export async function listFeatures() {
  requireTenantId();
  const draft = await SiteConfig.findOne({ status: 'draft' }).select('features').lean();
  const { tenant } = await currentPlan();
  const planKey = tenant?.planId ?? 'starter';
  const flags = (draft?.features ?? {}) as Record<string, { enabled?: boolean }>;
  return FEATURES.map((f) => ({
    ...f,
    enabled: Boolean(flags[f.key]?.enabled),
    locked: !planAllows(planKey, f.minPlan),
  }));
}

/**
 * Toggle with dependency handling (plan §7): enabling also enables dependencies; disabling
 * also disables dependents. Writes to the draft; takes effect on publish.
 */
export async function toggleFeature(key: string, enabled: boolean) {
  requireTenantId();
  const def = FEATURE_MAP.get(key);
  if (!def) throw notFound('Feature');
  if (!def.available) throw badRequest(`${def.name} is coming soon`);
  const { tenant } = await currentPlan();
  const planKey = tenant?.planId ?? 'starter';

  const keys = enabled ? [key, ...dependenciesOf(key)] : [key, ...dependentsOf(key)];
  if (enabled) {
    for (const k of keys) {
      const d = FEATURE_MAP.get(k)!;
      if (!planAllows(planKey, d.minPlan)) {
        throw new AppError(402, 'PLAN_LIMIT', `${d.name} needs the ${d.minPlan} plan or higher`);
      }
      if (!d.available) throw badRequest(`${d.name} is coming soon`);
    }
  }

  const draft = await SiteConfig.findOne({ status: 'draft' }).select('features').lean();
  const flags = { ...((draft?.features ?? {}) as Record<string, { enabled: boolean }>) };
  for (const k of keys) flags[k] = { ...(flags[k] ?? {}), enabled };
  if (!flags.delivery?.enabled && !flags.pickup?.enabled) {
    throw badRequest('Keep at least one of Delivery or Pickup turned on');
  }
  if (!flags.cod?.enabled && !flags.onlinePayment?.enabled) {
    throw badRequest('Keep at least one payment method turned on');
  }
  const $set: Record<string, unknown> = {};
  for (const k of keys) $set[`features.${k}.enabled`] = enabled;
  await SiteConfig.updateOne({ status: 'draft' }, { $set });
  return { changed: keys, enabled };
}
