import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isValidObjectId, Types } from 'mongoose';
import { getEnv } from '../../config/env';
import { runAsPlatform, runWithTenant } from '../../db/tenantContext';
import { Role, Tenant, User, type Permission } from '../../models';
import { AppError, forbidden } from '../../services/errors';
import { resolveTenantByHost } from '../../services/tenants';

export interface StaffClaims {
  sub: string; // userId
  tid: string; // tenantId
  typ: 'staff';
}

export interface AuthInfo {
  tenantId: Types.ObjectId;
  userId?: Types.ObjectId;
  permissions: Set<string>;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthInfo;
  }
}

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Authentication required');

export function signStaffToken(userId: string, tenantId: string, expiresIn: jwt.SignOptions['expiresIn'] = '15m') {
  return jwt.sign({ tid: tenantId, typ: 'staff' }, getEnv().JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn,
    issuer: 'quickstore-api',
    audience: 'tenant-admin',
  });
}

/**
 * Tenant Admin auth. tenantId comes ONLY from the verified token — never from the
 * body, query or a header — and every downstream DB call runs inside that tenant.
 */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  let claims: StaffClaims;
  try {
    claims = jwt.verify(header.slice(7), getEnv().JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'quickstore-api',
      audience: 'tenant-admin',
    }) as StaffClaims;
  } catch {
    return next(unauthorized());
  }
  if (claims.typ !== 'staff' || !isValidObjectId(claims.tid) || !isValidObjectId(claims.sub)) {
    return next(unauthorized());
  }

  const tenantId = new Types.ObjectId(claims.tid);
  const userId = new Types.ObjectId(claims.sub);

  void runWithTenant({ tenantId, userId }, async () => {
    try {
      const tenant = await runAsPlatform('auth: tenant status', () =>
        Tenant.findOne({ _id: tenantId }).select('status').lean(),
      );
      if (!tenant || tenant.status === 'suspended' || tenant.status === 'deleted') throw forbidden('Store is not available');

      const user = await User.findOne({ _id: userId, active: true }).select('roleId').lean();
      if (!user) throw unauthorized();
      const role = await Role.findOne({ _id: user.roleId }).select('permissions').lean();

      req.auth = { tenantId, userId, permissions: new Set(role?.permissions ?? []) };
      next(); // downstream handlers inherit this async tenant context
    } catch (err) {
      next(err);
    }
  });
}

export function requirePermission(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const p = req.auth?.permissions;
    if (!p) return next(unauthorized());
    if (p.has('*') || perms.every((x) => p.has(x))) return next();
    next(forbidden('Missing permission: ' + perms.join(', ')));
  };
}

/** Storefront: tenant resolved from the Host header against the domains collection. */
export function resolveStorefrontTenant(req: Request, _res: Response, next: NextFunction) {
  resolveTenantByHost(req.headers.host)
    .then((tenantId) => {
      if (!tenantId) throw new AppError(404, 'STORE_NOT_FOUND', 'Store not found');
      void runWithTenant({ tenantId }, () => next());
    })
    .catch(next);
}
