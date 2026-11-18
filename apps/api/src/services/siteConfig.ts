import { Types } from 'mongoose';
import { SiteConfig, Tenant } from '../models';
import { requireTenantId, runAsPlatform } from '../db/tenantContext';
import { SiteConfigPatch } from './validation';
import { conflict, notFound } from './errors';

const SECTIONS = ['theme', 'layout', 'features', 'seo', 'settings'] as const;

export async function getDraft() {
  requireTenantId();
  const draft = await SiteConfig.findOne({ status: 'draft' }).lean();
  if (!draft) throw notFound('Draft site config');
  return draft;
}

/** Shallow-merges each provided section key into the draft (e.g. only theme.colors changes). */
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
    // Tenant is a platform document; we update exactly the caller's own tenant.
    await runAsPlatform('publish: activate own tenant', () =>
      Tenant.updateOne({ _id: tenantId, status: 'draft' }, { $set: { status: 'active' } }),
    );
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
