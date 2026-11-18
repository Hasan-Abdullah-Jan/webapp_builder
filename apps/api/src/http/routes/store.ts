import { Router } from 'express';
import { resolveStorefrontTenant } from '../middleware/auth';
import * as store from '../../services/store';
import { rateLimit } from '../../services/rateLimit';
import { created, wrap } from '../wrap';
import { badRequest } from '../../services/errors';

export function storeRouter() {
  const r = Router();
  r.use(resolveStorefrontTenant); // tenant from store host → domains collection

  r.get('/config', wrap((req) => store.storeConfig(req.store!, req.store!.preview)));
  r.get('/menu', wrap((req) => store.storeMenu(typeof req.query.branchId === 'string' ? req.query.branchId : undefined)));
  r.post('/cart/quote', rateLimit({ name: 'quote', windowMs: 60_000, max: 120 }), wrap((req) => store.quote(req.store!, req.body)));
  r.post(
    '/orders',
    rateLimit({ name: 'order', windowMs: 10 * 60_000, max: 20 }),
    created((req) => {
      if (req.store!.preview) throw badRequest("Orders can't be placed from a preview link");
      return store.placeOrder(req.store!, req.body, req.headers['idempotency-key'] as string | undefined);
    }),
  );
  r.get('/orders/:id/track', wrap((req) => store.trackOrder(String(req.params.id), String(req.query.code ?? ''))));
  return r;
}
