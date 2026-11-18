import { Router } from 'express';
import * as platform from '../../services/platform';
import { requirePlatform } from '../middleware/auth';
import { wrap } from '../wrap';

export function platformRouter() {
  const r = Router();
  r.get('/overview', requirePlatform(), wrap(() => platform.overview()));
  r.get('/tenants', requirePlatform(), wrap((req) => platform.listTenants(req.query)));
  r.get('/tenants/:id', requirePlatform(), wrap((req) => platform.tenantDetail(String(req.params.id))));
  r.post('/tenants/:id/suspend', requirePlatform('owner'),
    wrap((req) => platform.setTenantStatus(String(req.params.id), 'suspended', req.body, req.platform!.userId)));
  r.post('/tenants/:id/reactivate', requirePlatform('owner', 'support'),
    wrap((req) => platform.setTenantStatus(String(req.params.id), 'active', req.body, req.platform!.userId)));
  r.post('/tenants/:id/plan', requirePlatform('owner', 'finance'),
    wrap((req) => platform.changePlan(String(req.params.id), req.body, req.platform!.userId)));
  r.post('/tenants/:id/extend-trial', requirePlatform('owner', 'finance', 'support'),
    wrap((req) => platform.extendTrial(String(req.params.id), req.body, req.platform!.userId)));
  r.get('/plans', requirePlatform(), wrap(() => platform.listPlans()));
  r.patch('/plans/:key', requirePlatform('owner', 'finance'),
    wrap((req) => platform.updatePlan(String(req.params.key), req.body, req.platform!.userId)));
  r.get('/audit', requirePlatform('owner'), wrap(() => platform.platformAudit()));
  r.get('/me', requirePlatform(), wrap((req) => ({ userId: req.platform!.userId, role: req.platform!.role })));
  return r;
}
