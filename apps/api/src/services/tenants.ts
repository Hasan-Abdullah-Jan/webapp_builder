import { Types } from 'mongoose';
import { z } from 'zod';
import { Domain, Role, SiteConfig, Tenant, User, DEFAULT_ROLES } from '../models';
import { BUSINESS_TYPES } from '../models/Tenant';
import { runAsPlatform, runWithTenant } from '../db/tenantContext';
import { badRequest, conflict } from './errors';

const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'ops', 'app', 'mail', 'static', 'cdn', 'assets', 'status', 'help', 'support', 'billing',
  'login', 'signup', 'quickstore', 'dashboard', 'store', 'shop', 'test', 'staging', 'dev',
]);

export const ProvisionInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/),
    businessType: z.enum(BUSINESS_TYPES).default('restaurant'),
    owner: z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().toLowerCase().email().optional(),
        phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/).optional(),
      })
      .strict()
      .refine((o) => o.email || o.phone, 'owner needs an email or phone'),
  })
  .strict();

export const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? 'quickstore.pk';

/**
 * Plan §11.1 (DB part): creates tenant (draft), reserved subdomain, default roles,
 * owner user and an empty draft site config. Server-side only.
 */
export async function provisionTenant(input: unknown) {
  const data = ProvisionInput.parse(input);
  if (RESERVED_SLUGS.has(data.slug)) throw badRequest('This website address is reserved');

  const tenant = await runAsPlatform('provision: create tenant', async () => {
    if (await Tenant.exists({ slug: data.slug })) throw conflict('This website address is taken');
    try {
      return await Tenant.create({ name: data.name, slug: data.slug, businessType: data.businessType, status: 'draft' });
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
      const owner = await User.create({ ...data.owner, roleId: ownerRole._id });
      await SiteConfig.create({ version: 0, status: 'draft' });
      return owner._id;
    });
    await runAsPlatform('provision: finish tenant', async () => {
      await Domain.create({ tenantId, hostname: `${data.slug}.${ROOT_DOMAIN}`, type: 'subdomain', primary: true });
      await Tenant.updateOne({ _id: tenantId }, { $set: { ownerId } });
    });
    return { tenantId: String(tenantId), ownerId: String(ownerId), slug: data.slug };
  } catch (err) {
    await runAsPlatform('provision: mark failed', () =>
      Tenant.updateOne({ _id: tenantId }, { $set: { status: 'provisioning_failed' } }),
    );
    throw err;
  }
}

/** Storefront host → tenant resolution (plan §3.3). Only active tenants on verified/subdomain hosts. */
export async function resolveTenantByHost(rawHost: string | undefined) {
  if (!rawHost) return null;
  const hostname = rawHost.toLowerCase().split(':')[0].trim();
  if (!/^[a-z0-9.-]{1,253}$/.test(hostname)) return null;
  return runAsPlatform('storefront: resolve host', async () => {
    const domain = await Domain.findOne({ hostname }).lean();
    if (!domain || (domain.type === 'custom' && !domain.verified)) return null;
    const tenant = await Tenant.findOne({ _id: domain.tenantId, status: 'active' }).select('_id').lean();
    return tenant ? (tenant._id as Types.ObjectId) : null;
  });
}
