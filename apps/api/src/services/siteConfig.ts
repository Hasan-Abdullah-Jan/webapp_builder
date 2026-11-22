import { Types } from 'mongoose';
import { Branch, Category, Product, SiteConfig, Tenant, audit } from '../models';
import { requireTenantId, runAsPlatform } from '../db/tenantContext';
import { TEMPLATE_MAP } from '../catalog/templates';
import { SiteConfigPatch } from './validation';
import { AppError, badRequest, conflict, notFound } from './errors';
import { bus } from './events';
import { purgeTenantCache } from './cachePurge';
import { signAccess } from './tokens';

const SECTIONS = ['theme', 'layout', 'features', 'seo', 'settings'] as const;

export async function getDraft() {
  requireTenantId();
  const draft = await SiteConfig.findOne({ status: 'draft' }).lean();
  if (!draft) throw notFound('Draft site config');
  return draft;
}

/**
 * Shallow-merges each provided section key into the draft (e.g. only theme.colors changes).
 * `layout.home` is replaced as a whole (it is an ordered list of sections).
 */
export async function patchDraft(body: unknown) {
  requireTenantId();
  const patch = SiteConfigPatch.parse(body) as Record<string, Record<string, unknown> | undefined>;
  const $set: Record<string, unknown> = {};
  for (const section of SECTIONS) {
    const value = patch[section];
    if (!value) continue;
    for (const [k, v] of Object.entries(value)) $set[`${section}.${k}`] = v;
  }
  if (Object.keys($set).length === 0) return getDraft();
  const doc = await SiteConfig.findOneAndUpdate({ status: 'draft' }, { $set }, { new: true }).lean();
  if (!doc) throw notFound('Draft site config');
  return doc;
}

/** "Reset to template" (plan §6.3): restores theme + layout, keeps features/settings/catalogue. */
export async function resetToTemplate(templateKey: string) {
  const tenantId = requireTenantId();
  const tpl = TEMPLATE_MAP.get(templateKey);
  if (!tpl) throw badRequest('Unknown template');
  await runAsPlatform('reset template: record choice', () => Tenant.updateOne({ _id: tenantId }, { $set: { templateKey } }));
  return SiteConfig.findOneAndUpdate(
    { status: 'draft' },
    { $set: { theme: tpl.theme, layout: tpl.layout } },
    { new: true },
  ).lean();
}

/** Plan §11.2 step 1: readiness checklist. */
export async function readiness() {
  requireTenantId();
  const draft = await SiteConfig.findOne({ status: 'draft' }).lean();
  const f = (draft?.features ?? {}) as Record<string, { enabled?: boolean }>;
  const theme = (draft?.theme ?? {}) as Record<string, unknown>;
  const [categories, products, branches] = await Promise.all([
    Category.countDocuments({}),
    Product.countDocuments({ active: true }),
    Branch.countDocuments({}),
  ]);
  const checks = [
    { key: 'logo', label: 'Upload a logo', ok: Boolean(theme.logo), required: false },
    { key: 'category', label: 'Add at least 1 category', ok: categories > 0, required: true },
    { key: 'product', label: 'Add at least 1 item', ok: products > 0, required: true },
    { key: 'branch', label: 'Add your location and hours', ok: branches > 0, required: true },
    { key: 'fulfilment', label: 'Turn on Delivery or Pickup', ok: Boolean(f.delivery?.enabled || f.pickup?.enabled), required: true },
    { key: 'payment', label: 'Turn on a payment method', ok: Boolean(f.cod?.enabled || f.onlinePayment?.enabled), required: true },
  ];
  return { ready: checks.every((c) => c.ok || !c.required), checks };
}

async function latestPublishedVersion(): Promise<number> {
  const latest = await SiteConfig.findOne({ status: 'published' }).sort({ version: -1 }).select('version').lean();
  return latest?.version ?? 0;
}

/** Copies the draft (or an earlier published version, for rollback) into a new immutable published version. */
export async function publish(userId?: Types.ObjectId, fromVersion?: number) {
  const tenantId = requireTenantId();
  const source =
    fromVersion === undefined
      ? await SiteConfig.findOne({ status: 'draft' }).lean()
      : await SiteConfig.findOne({ status: 'published', version: fromVersion }).lean();
  if (!source) throw notFound(fromVersion === undefined ? 'Draft site config' : `Published version ${fromVersion}`);

  if (fromVersion === undefined) {
    const r = await readiness();
    if (!r.ready) {
      throw new AppError(400, 'NOT_READY', 'Finish these steps before publishing', r.checks.filter((c) => c.required && !c.ok));
    }
  }

  const version = (await latestPublishedVersion()) + 1;
  try {
    const published = await SiteConfig.create({
      version,
      status: 'published',
      theme: source.theme,
      layout: source.layout,
      features: source.features,
      seo: source.seo,
      settings: source.settings,
      publishedAt: new Date(),
      publishedBy: userId,
    });
    // Rollback also restores the draft so the builder shows what is live.
    if (fromVersion !== undefined) {
      await SiteConfig.updateOne(
        { status: 'draft' },
        { $set: { theme: source.theme, layout: source.layout, features: source.features, seo: source.seo, settings: source.settings } },
      );
    }
    await runAsPlatform('publish: activate own tenant', () =>
      Tenant.updateOne({ _id: tenantId, status: 'draft' }, { $set: { status: 'active' } }),
    );
    await audit({
      tenantId, actorType: 'staff', actorId: userId, action: fromVersion ? 'site.rollback' : 'site.publish', target: `v${version}`,
    });
    await purgeTenantCache(tenantId);
    bus.emitEvent('site.published', { tenantId: String(tenantId), version });
    return published.toObject();
  } catch (err: any) {
    if (err?.code === 11000) throw conflict('Another publish is in progress, please retry');
    throw err;
  }
}

export async function listVersions() {
  requireTenantId();
  return SiteConfig.find({ status: 'published' })
    .sort({ version: -1 })
    .select('version publishedAt publishedBy')
    .limit(50)
    .lean();
}

/** Storefront read: latest published config for the tenant in context. */
export async function getPublished() {
  requireTenantId();
  const doc = await SiteConfig.findOne({ status: 'published' })
    .sort({ version: -1 })
    .select('version theme layout features seo')
    .lean();
  if (!doc) throw notFound('Published site');
  return doc;
}

/** Short-lived token that lets the storefront render this tenant's DRAFT (builder preview / share link). */
export function previewToken(ttl: '2h' | '7d' = '2h') {
  const tenantId = requireTenantId();
  return { token: signAccess('preview', String(tenantId), { tid: String(tenantId) }, ttl) };
}
