import { Router, type Request, type Response } from 'express';
import { Branch, Category, Customer, Product, type Permission } from '../../models';
import { createCrudService, type CrudService } from '../../services/crud';
import * as v from '../../services/validation';
import * as siteConfig from '../../services/siteConfig';
import { orderReads, updateOrderStatus } from '../../services/orders';
import { requirePermission, requireStaff } from '../middleware/auth';
import { z } from 'zod';

type H = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: H) => (req: Request, res: Response, next: (e?: unknown) => void) =>
  fn(req, res).then((body) => (res.headersSent ? undefined : res.json(body))).catch(next);

function mountCrud(router: Router, path: string, svc: CrudService, read: Permission, write: Permission) {
  router.get(path, requirePermission(read), wrap((req) => svc.list(req.query as Record<string, unknown>)));
  router.get(`${path}/:id`, requirePermission(read), wrap((req) => svc.get(req.params.id as string)));
  router.post(
    path,
    requirePermission(write),
    wrap(async (req, res) => {
      res.status(201);
      return svc.create(req.body);
    }),
  );
  router.patch(`${path}/:id`, requirePermission(write), wrap((req) => svc.update(req.params.id as string, req.body)));
  router.delete(`${path}/:id`, requirePermission(write), wrap((req) => svc.remove(req.params.id as string)));
}

export const categories = createCrudService(Category, {
  name: 'Category', createSchema: v.CategoryCreate, updateSchema: v.CategoryUpdate, searchFields: ['name', 'slug'],
});
export const products = createCrudService(Product, {
  name: 'Product', createSchema: v.ProductCreate, updateSchema: v.ProductUpdate,
  searchFields: ['name', 'slug'], filterFields: ['categoryId', 'active'],
});
export const branches = createCrudService(Branch, {
  name: 'Branch', createSchema: v.BranchCreate, updateSchema: v.BranchUpdate, searchFields: ['name'],
});
export const customers = createCrudService(Customer, {
  name: 'Customer', createSchema: v.CustomerCreate, updateSchema: v.CustomerUpdate, searchFields: ['phone', 'name', 'email'],
});

export function adminRouter() {
  const r = Router();
  r.use(requireStaff); // every /v1/admin route runs inside the caller's tenant

  mountCrud(r, '/categories', categories, 'catalog.read', 'catalog.write');
  mountCrud(r, '/products', products, 'catalog.read', 'catalog.write');
  mountCrud(r, '/branches', branches, 'branches.read', 'branches.write');
  mountCrud(r, '/customers', customers, 'customers.read', 'customers.write');

  r.get('/orders', requirePermission('orders.read'), wrap((req) => orderReads.list(req.query as Record<string, unknown>)));
  r.get('/orders/:id', requirePermission('orders.read'), wrap((req) => orderReads.get(req.params.id as string)));
  r.patch(
    '/orders/:id/status',
    requirePermission('orders.update_status'),
    wrap((req) => updateOrderStatus(req.params.id as string, req.body, req.auth?.userId)),
  );

  r.get('/site-config/draft', requirePermission('site.read'), wrap(() => siteConfig.getDraft()));
  r.patch('/site-config/draft', requirePermission('site.write'), wrap((req) => siteConfig.patchDraft(req.body)));
  r.get('/site-config/versions', requirePermission('site.read'), wrap(() => siteConfig.listVersions()));
  r.post(
    '/site-config/publish',
    requirePermission('site.publish'),
    wrap((req) => {
      const { fromVersion } = z.object({ fromVersion: z.number().int().min(1).optional() }).strict().parse(req.body ?? {});
      return siteConfig.publish(req.auth?.userId, fromVersion);
    }),
  );
  return r;
}
