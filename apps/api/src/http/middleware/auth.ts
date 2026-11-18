import type { NextFunction, Request, Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { runAsPlatform, runWithTenant } from '../../db/tenantContext';
import { PlatformUser, Role, Tenant, User, type Permission, type PlatformRole } from '../../models';
import { AppError, forbidden } from '../../services/errors';
import { resolveTenantByHost } from '../../services/tenants';
import { signAccess, verifyAccess } from '../../services/tokens';
import type { StoreTenant } from '../../services/store';

export interface AuthInfo {
  tenantId: Types.ObjectId;
  userId?: Types.ObjectId;
  permissions: Set<string>;
}

export interface PlatformAuth {
  userId: Types.ObjectId;
  role: PlatformRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthInfo;
    platform?: PlatformAuth;
    store?: StoreTenant & { preview?: boolean };
  }
}

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Authentication required');

/** Test/seed helper: sign a staff access token directly. */
export function signStaffToken(userId: string, tenantId: string, expiresIn: '15m' | '1h' = '15m') {
  return signAccess('tenant-admin', userId, { tid: tenantId, typ: 'staff' }, expiresIn);
}

function bearer(req: Request) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
}

/**
 * Tenant Admin auth. tenantId comes ONLY from the verified token, never from the body,
 * query or a header. Every downstream DB call runs inside that tenant.
 */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next(unauthorized());
  let claims: { sub: string; tid: string; typ: string };
  try {
    claims = verifyAccess(token, 'tenant-admin');
  } catch {
    return next(unauthorized());
  }
  if (claims.typ !== 'staff' || !isValidObjectId(claims.tid) || !isValidObjectId(claims.sub)) return next(unauthorized());

  const tenantId = new Types.ObjectId(claims.tid);
  const userId = new Types.ObjectId(claims.sub);

  void runWithTenant({ tenantId, userId }, async () => {
    try {
      const tenant = await runAsPlatform('auth: tenant status', () => Tenant.findOne({ _id: tenantId }).select('status').lean());
      if (!tenant || !['draft', 'active'].includes(tenant.status)) throw forbidden('This store is suspended. Contact support.');
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
    next(forbidden("Your role doesn't allow this"));
  };
}

/** Super Admin auth: platform token + optional IP allow-list (PLATFORM_IP_ALLOWLIST, comma-separated). */
export function requirePlatform(...roles: PlatformRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const allow = (process.env.PLATFORM_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(req.ip ?? '')) return next(forbidden('Not allowed from this network'));
    const token = bearer(req);
    if (!token) return next(unauthorized());
    let claims: { sub: string; role: PlatformRole; typ: string };
    try {
      claims = verifyAccess(token, 'platform');
    } catch {
      return next(unauthorized());
    }
    if (claims.typ !== 'platform' || !isValidObjectId(claims.sub)) return next(unauthorized());
    void runAsPlatform('platform staff request', async () => {
      try {
        const user = await PlatformUser.findOne({ _id: claims.sub, active: true }).select('role').lean();
        if (!user) throw unauthorized();
        if (roles.length && user.role !== 'owner' && !roles.includes(user.role as PlatformRole)) {
          throw forbidden("Your platform role doesn't allow this");
        }
        req.platform = { userId: user._id, role: user.role as PlatformRole };
        next();
      } catch (err) {
        next(err);
      }
    });
  };
}

/**
 * Storefront: tenant resolved from the store host (X-Store-Host, set by the storefront server,
 * else Host) against the domains collection. Store data is public, so trusting the header only
 * lets a caller read what any visitor to that host could read.
 * A valid preview token (X-Preview-Token) for the SAME tenant unlocks draft stores and the draft config.
 */
export function resolveStorefrontTenant(req: Request, _res: Response, next: NextFunction) {
  const host = (req.headers['x-store-host'] as string | undefined) ?? req.headers.host;
  const previewToken = req.headers['x-preview-token'] as string | undefined;
  let previewTid: string | undefined;
  if (previewToken) {
    try {
      previewTid = verifyAccess<{ tid: string }>(previewToken, 'preview').tid;
    } catch {
      return next(new AppError(401, 'PREVIEW_EXPIRED', 'This preview link has expired'));
    }
  }
  resolveTenantByHost(host, Boolean(previewTid))
    .then((tenant) => {
      if (!tenant) throw new AppError(404, 'STORE_NOT_FOUND', 'Store not found');
      const preview = Boolean(previewTid && String(tenant._id) === previewTid);
      if (tenant.status !== 'active' && !preview) throw new AppError(404, 'STORE_NOT_FOUND', 'Store not found');
      req.store = { ...(tenant as unknown as StoreTenant), preview };
      void runWithTenant({ tenantId: tenant._id as Types.ObjectId }, () => next());
    })
    .catch(next);
}
