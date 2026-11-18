import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Branch, Category, Customer, ModifierGroup, Product, Tenant, type Permission } from '../../models';
import { createCrudService, type CrudService } from '../../services/crud';
import * as v from '../../services/validation';
import * as siteConfig from '../../services/siteConfig';
import * as features from '../../services/features';
import * as staff from '../../services/staff';
import { board, exportCsv, orderReads, updateOrderStatus } from '../../services/orders';
import { dashboard, setAcceptingOrders } from '../../services/dashboard';
import { assertWithinLimit, usage } from '../../services/limits';
import { me } from '../../services/auth';
import express from 'express';
import { Coupon } from '../../models';
import { CouponCreate, CouponUpdate } from '../../services/coupons';
import { salesReport } from '../../services/reports';
import { exportProductsCsv, importProductsCsv } from '../../services/productCsv';
import { deleteImage, listImages, MAX_BYTES, uploadImage } from '../../services/media';
import { bus } from '../../services/events';
import { requireTenantId, runAsPlatform } from '../../db/tenantContext';
import { THEME_PRESETS, FONT_PAIRS, SECTION_TYPES } from '../../catalog/themes';
import { TEMPLATES } from '../../catalog/templates';
import { requirePermission, requireStaff } from '../middleware/auth';
import { created, wrap } from '../wrap';

function mountCrud(router: Router, path: string, svc: CrudService, read: Permission, write: Permission) {
  router.get(path, requirePermission(read), wrap((req) => svc.list(req.query as Record<string, unknown>)));
  router.get(`${path}/:id`, requirePermission(read), wrap((req) => svc.get(String(req.params.id))));
  router.post(path, requirePermission(write), created((req) => svc.create(req.body)));
  router.patch(`${path}/:id`, requirePermission(write), wrap((req) => svc.update(String(req.params.id), req.body)));
  router.delete(`${path}/:id`, requirePermission(write), wrap((req) => svc.remove(String(req.params.id))));
}

export const categories = createCrudService(Category, {
  name: 'Category', createSchema: v.CategoryCreate, updateSchema: v.CategoryUpdate, searchFields: ['name', 'slug'], sort: { sort: 1 },
});
export const products = createCrudService(Product, {
  name: 'Product', createSchema: v.ProductCreate, updateSchema: v.ProductUpdate,
  searchFields: ['name', 'slug'], filterFields: ['categoryId', 'active'], sort: { sort: 1 },
  beforeCreate: () => assertWithinLimit('products'),
});
export const modifierGroups = createCrudService(ModifierGroup, {
  name: 'Add-on group', createSchema: v.ModifierGroupCreate, updateSchema: v.ModifierGroupUpdate, searchFields: ['name'], sort: { name: 1 },
});
export const branches = createCrudService(Branch, {
  name: 'Branch', createSchema: v.BranchCreate, updateSchema: v.BranchUpdate, searchFields: ['name'], sort: { name: 1 },
  beforeCreate: () => assertWithinLimit('branches'),
});
export const coupons = createCrudService(Coupon, {
  name: 'Discount code', createSchema: CouponCreate, updateSchema: CouponUpdate, searchFields: ['code'],
});
export const customers = createCrudService(Customer, {
  name: 'Customer', createSchema: v.CustomerCreate, updateSchema: v.CustomerUpdate, searchFields: ['phone', 'name', 'email'],
});

const StoreSettings = z
  .object({
    name: z.string().trim().min(1).max(120),
    timezone: z.string().max(60).refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'unknown timezone'),
    currency: z.string().length(3).toUpperCase(),
  })
  .partial()
  .strict();

/** Server-sent events stream of this tenant's order events (live order board). */
function orderStream(req: Request, res: Response) {
  const tenantId = String(requireTenantId());
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const offs = [
    bus.onEvent('order.created', (e) => e.tenantId === tenantId && send('order.created', e)),
    bus.onEvent('order.status_changed', (e) => e.tenantId === tenantId && send('order.status_changed', e)),
  ];
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    offs.forEach((off) => off());
  });
}

export function adminRouter() {
  const r = Router();
  r.use(requireStaff); // every /v1/admin route runs inside the caller's tenant

  r.get('/me', wrap((req) => me(req.auth!.tenantId, req.auth!.userId!)));
  r.get('/dashboard', wrap(() => dashboard()));
  r.get('/usage', wrap(() => usage()));
  r.post('/store/accepting-orders', requirePermission('orders.update_status'),
    wrap((req) => setAcceptingOrders(z.object({ accepting: z.boolean() }).strict().parse(req.body).accepting)));
  r.patch('/store', requirePermission('site.write'), wrap(async (req) => {
    const data = StoreSettings.parse(req.body);
    const tenantId = requireTenantId();
    return runAsPlatform('settings: own tenant', () =>
      Tenant.findOneAndUpdate({ _id: tenantId }, { $set: data }, { new: true }).select('name timezone currency').lean());
  }));

  // Specific product routes before the generic /products/:id.
  r.get('/products/export.csv', requirePermission('catalog.read'), wrap(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send(await exportProductsCsv());
  }));
  r.post('/products/import', requirePermission('catalog.write'), express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
    wrap((req) => importProductsCsv(req.body)));
  r.get('/media', requirePermission('catalog.read'), wrap(() => listImages()));
  r.post('/media', requirePermission('catalog.write'), express.raw({ type: () => true, limit: MAX_BYTES + 1024 }),
    created((req) => uploadImage(req.body, String(req.headers['x-filename'] ?? 'image'))));
  r.delete('/media/:id', requirePermission('catalog.write'), wrap((req) => deleteImage(String(req.params.id))));
  r.get('/reports', requirePermission('orders.read'), wrap((req) => salesReport(req.query.days)));
  mountCrud(r, '/coupons', coupons, 'site.read', 'site.write');

  mountCrud(r, '/categories', categories, 'catalog.read', 'catalog.write');
  mountCrud(r, '/products', products, 'catalog.read', 'catalog.write');
  mountCrud(r, '/modifier-groups', modifierGroups, 'catalog.read', 'catalog.write');
  mountCrud(r, '/branches', branches, 'branches.read', 'branches.write');
  mountCrud(r, '/customers', customers, 'customers.read', 'customers.write');
  r.post('/categories/reorder', requirePermission('catalog.write'), wrap(async (req) => {
    const { ids } = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(500) }).strict().parse(req.body);
    await Promise.all(ids.map((id, i) => Category.updateOne({ _id: id }, { $set: { sort: i } })));
    return { ok: true };
  }));

  r.get('/orders/board', requirePermission('orders.read'), wrap(() => board()));
  r.get('/orders/stream', requirePermission('orders.read'), orderStream);
  r.get('/orders/export.csv', requirePermission('orders.read'), wrap(async (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(await exportCsv(30));
  }));
  r.get('/orders', requirePermission('orders.read'), wrap((req) => orderReads.list(req.query as Record<string, unknown>)));
  r.get('/orders/:id', requirePermission('orders.read'), wrap((req) => orderReads.get(String(req.params.id))));
  r.patch('/orders/:id/status', requirePermission('orders.update_status'),
    wrap((req) => updateOrderStatus(String(req.params.id), req.body, req.auth?.userId)));

  r.get('/site-config/draft', requirePermission('site.read'), wrap(() => siteConfig.getDraft()));
  r.patch('/site-config/draft', requirePermission('site.write'), wrap((req) => siteConfig.patchDraft(req.body)));
  r.post('/site-config/reset', requirePermission('site.write'),
    wrap((req) => siteConfig.resetToTemplate(z.object({ templateKey: z.string().max(60) }).strict().parse(req.body).templateKey)));
  r.get('/site-config/readiness', requirePermission('site.read'), wrap(() => siteConfig.readiness()));
  r.get('/site-config/versions', requirePermission('site.read'), wrap(() => siteConfig.listVersions()));
  r.get('/site-config/preview-token', requirePermission('site.read'),
    wrap((req) => siteConfig.previewToken(req.query.share === '1' ? '7d' : '2h')));
  r.post('/site-config/publish', requirePermission('site.publish'), wrap((req) => {
    const { fromVersion } = z.object({ fromVersion: z.number().int().min(1).optional() }).strict().parse(req.body ?? {});
    return siteConfig.publish(req.auth?.userId, fromVersion);
  }));
  r.get('/design/options', wrap(() => ({ presets: THEME_PRESETS, fonts: FONT_PAIRS, sections: SECTION_TYPES, templates: TEMPLATES.map(({ sample: _s, ...t }) => t) })));

  r.get('/features', requirePermission('site.read'), wrap(() => features.listFeatures()));
  r.post('/features/:key/toggle', requirePermission('site.write'),
    wrap((req) => features.toggleFeature(String(req.params.key), z.object({ enabled: z.boolean() }).strict().parse(req.body).enabled)));

  r.get('/staff', requirePermission('staff.manage'), wrap(() => staff.listStaff()));
  r.post('/staff', requirePermission('staff.manage'), created((req) => staff.createStaff(req.body, req.auth?.userId)));
  r.patch('/staff/:id', requirePermission('staff.manage'), wrap((req) => staff.updateStaff(String(req.params.id), req.body, req.auth?.userId)));
  r.delete('/staff/:id', requirePermission('staff.manage'), wrap((req) => staff.deleteStaff(String(req.params.id), req.auth?.userId)));
  return r;
}
