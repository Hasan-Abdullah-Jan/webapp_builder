import { Router } from 'express';
import { resolveStorefrontTenant } from '../middleware/auth';
import * as siteConfig from '../../services/siteConfig';

export function storeRouter() {
  const r = Router();
  r.use(resolveStorefrontTenant); // tenant from Host header → domains collection
  r.get('/config', (_req, res, next) => {
    siteConfig.getPublished().then((c) => res.json(c)).catch(next);
  });
  return r;
}
