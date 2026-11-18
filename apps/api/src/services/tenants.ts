import { Types } from 'mongoose';
import { z } from 'zod';
import {
  Category, Domain, ModifierGroup, Product, Role, SiteConfig, Tenant, User, DEFAULT_ROLES, audit,
} from '../models';
import { BUSINESS_TYPES } from '../models/Tenant';
import { runAsPlatform, runWithTenant } from '../db/tenantContext';
import { TEMPLATE_MAP, templatesFor } from '../catalog/templates';
import { defaultFeatures } from '../catalog/features';
import { hashPassword } from './password';
import { badRequest, conflict } from './errors';
import { bus } from './events';

export const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'ops', 'app', 'mail', 'static', 'cdn', 'assets', 'status', 'help', 'support', 'billing',
  'login', 'signup', 'quickstore', 'dashboard', 'store', 'shop', 'test', 'staging', 'dev', 'preview', 'root',
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export const ProvisionInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().toLowerCase().regex(SLUG_RE, 'Use 3-40 letters, numbers or dashes'),
    businessType: z.enum(BUSINESS_TYPES).default('restaurant'),
    templateKey: z.string().max(60).optional(),
    /** Keep the template's sample menu so the store looks complete from minute one. */
    sampleData: z.boolean().default(true),
    owner: z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().toLowerCase().email().max(254),
        phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/).optional(),
        password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
      })
      .strict(),
  })
  .strict();

export function rootDomain() {
  return (process.env.ROOT_DOMAIN ?? 'localhost').toLowerCase();
}

export async function isSlugAvailable(slug: string) {
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) return false;
  return !(await runAsPlatform('signup: slug check', () => Tenant.exists({ slug })));
}

/** Clones a template's sample catalogue into the tenant in context. */
export async function cloneSampleCatalog(templateKey: string) {
  const tpl = TEMPLATE_MAP.get(templateKey);
  if (!tpl) return;
  const groups = await ModifierGroup.insertMany(
    tpl.sample.modifierGroups.map((g) => ({ name: g.name, min: g.min, max: g.max, options: g.options })),
  );
  const groupIds = new Map(tpl.sample.modifierGroups.map((g, i) => [g.key, groups[i]._id]));
  const cats = await Category.insertMany(tpl.sample.categories.map((c, i) => ({ ...c, sort: i })));
  const catIds = new Map(tpl.sample.categories.map((c, i) => [c.slug, cats[i]._id]));
  await Product.insertMany(
    tpl.sample.products.map((p, i) => ({
      name: p.name,
      slug: p.slug,
      description: p.description,
      basePrice: p.basePrice,
      tags: p.tags ?? [],
      variants: p.variants ?? [],
      ...(typeof p.stock === 'number' ? { stock: p.stock } : {}),
      categoryId: catIds.get(p.category),
      modifierGroupIds: (p.modifiers ?? []).map((k) => groupIds.get(k)).filter(Boolean),
      sort: i,
    })),
  );
}

/**
 * Plan §11.1: tenant (draft, 14-day trial), reserved subdomain, default roles, owner user,
 * draft site config cloned from the chosen template, optional sample catalogue.
 */
export async function provisionTenant(input: unknown) {
  const data = ProvisionInput.parse(input);
  if (RESERVED_SLUGS.has(data.slug)) throw badRequest('This website address is reserved');
  const templates = templatesFor(data.businessType);
  const tpl = (data.templateKey && TEMPLATE_MAP.get(data.templateKey)) || templates[0];
  if (!tpl) throw badRequest('Unknown template');

  const tenant = await runAsPlatform('provision: create tenant', async () => {
    if (await Tenant.exists({ slug: data.slug })) throw conflict('This website address is taken');
    try {
      return await Tenant.create({
        name: data.name,
        slug: data.slug,
        businessType: data.businessType,
        status: 'draft',
        planId: 'trial',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
        templateKey: tpl.key,
      });
    } catch (err: any) {
      if (err?.code === 11000) throw conflict('This website address is taken');
      throw err;
    }
  });

  const tenantId = tenant._id as Types.ObjectId;
  try {
    const ownerId = await runWithTenant({ tenantId }, async () => {
      const roles = await Role.insertMany(DEFAULT_ROLES.map((r) => ({ ...r, system: true })));
      const ownerRole = roles.find((r) => r.name === 'Owner')!;
      const { password, ...owner } = data.owner;
      const user = await User.create({
        ...owner,
        roleId: ownerRole._id,
        passwordHash: password ? await hashPassword(password) : undefined,
      });
      await SiteConfig.create({
        version: 0,
        status: 'draft',
        theme: tpl.theme,
        layout: tpl.layout,
        features: defaultFeatures(data.businessType),
        seo: { title: data.name, description: `Order online from ${data.name}` },
        settings: { taxPercent: 0 },
      });
      if (data.sampleData) await cloneSampleCatalog(tpl.key);
      return user._id;
    });
    await runAsPlatform('provision: finish tenant', async () => {
      await Domain.create({ tenantId, hostname: `${data.slug}.${rootDomain()}`, type: 'subdomain', primary: true });
      await Tenant.updateOne({ _id: tenantId }, { $set: { ownerId } });
      await audit({ tenantId, actorType: 'system', action: 'tenant.provisioned', target: data.slug });
    });
    bus.emitEvent('tenant.created', { tenantId: String(tenantId), slug: data.slug });
    return { tenantId: String(tenantId), ownerId: String(ownerId), slug: data.slug };
  } catch (err) {
    await runAsPlatform('provision: mark failed', () =>
      Tenant.updateOne({ _id: tenantId }, { $set: { status: 'provisioning_failed' } }),
    );
    throw err;
  }
}

/**
 * Storefront host → tenant (plan §3.3). Returns active tenants, plus draft tenants when
 * `allowDraft` is set (used only by authenticated preview).
 */
export async function resolveTenantByHost(rawHost: string | undefined, allowDraft = false) {
  if (!rawHost) return null;
  const hostname = rawHost.toLowerCase().split(':')[0].trim();
  if (!/^[a-z0-9.-]{1,253}$/.test(hostname)) return null;
  return runAsPlatform('storefront: resolve host', async () => {
    const domain = await Domain.findOne({ hostname }).lean();
    if (!domain || (domain.type === 'custom' && !domain.verified)) return null;
    const statuses = allowDraft ? ['active', 'draft'] : ['active'];
    const tenant = await Tenant.findOne({ _id: domain.tenantId, status: { $in: statuses } })
      .select('_id name slug currency timezone locale acceptingOrders status businessType')
      .lean();
    return tenant;
  });
}
