import { Types } from 'mongoose';
import { z } from 'zod';
import { PlatformUser, Role, Tenant, User, audit } from '../models';
import { runAsPlatform, runWithTenant } from '../db/tenantContext';
import { AppError } from './errors';
import { verifyPasswordOrDummy } from './password';
import { verifyTotp } from './totp';
import { createSession, revokeSession, rotateSession, signAccess } from './tokens';
import { provisionTenant } from './tenants';
import { vocabFor } from '../catalog/vocab';

const badLogin = () => new AppError(401, 'INVALID_LOGIN', 'Wrong website address, email or password');

async function issueStaffTokens(userId: Types.ObjectId, tenantId: Types.ObjectId, ua?: string) {
  const accessToken = signAccess('tenant-admin', String(userId), { tid: String(tenantId), typ: 'staff' });
  const refreshToken = await createSession('staff', userId, tenantId, ua);
  return { accessToken, refreshToken, tenantId: String(tenantId), userId: String(userId) };
}

export const SignupInput = z.object({}).passthrough(); // validated in provisionTenant

export async function signup(body: unknown, ua?: string) {
  const parsed = body as { owner?: { password?: string } };
  if (!parsed?.owner?.password) throw new AppError(400, 'VALIDATION_ERROR', 'Please choose a password');
  const res = await provisionTenant(body);
  return issueStaffTokens(new Types.ObjectId(res.ownerId), new Types.ObjectId(res.tenantId), ua);
}

const LoginInput = z
  .object({
    store: z.string().trim().toLowerCase().max(60),
    email: z.string().trim().toLowerCase().max(254),
    password: z.string().max(128),
  })
  .strict();

/** Staff are per tenant, so login names the store ("website address") as well as the email. */
export async function staffLogin(body: unknown, ua?: string) {
  const { store, email, password } = LoginInput.parse(body);
  const tenant = await runAsPlatform('login: find tenant', () =>
    Tenant.findOne({ slug: store, status: { $in: ['draft', 'active'] } }).select('_id').lean(),
  );
  const tenantId = tenant?._id as Types.ObjectId | undefined;
  const user = tenantId
    ? await runWithTenant({ tenantId }, () => User.findOne({ email, active: true }).select('+passwordHash').lean())
    : null;
  const ok = await verifyPasswordOrDummy(password, user?.passwordHash);
  if (!ok || !user || !tenantId) throw badLogin();
  await runWithTenant({ tenantId }, () => User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }));
  return issueStaffTokens(user._id, tenantId, ua);
}

export async function staffRefresh(refreshToken: unknown, ua?: string) {
  const { session, refreshToken: next } = await rotateSession('staff', String(refreshToken ?? ''), ua);
  const tenantId = session.tenantId as Types.ObjectId;
  const user = await runWithTenant({ tenantId }, () => User.findOne({ _id: session.userId, active: true }).select('_id').lean());
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
  return {
    accessToken: signAccess('tenant-admin', String(session.userId), { tid: String(tenantId), typ: 'staff' }),
    refreshToken: next,
  };
}

export async function logout(refreshToken: unknown) {
  await revokeSession(String(refreshToken ?? ''));
  return { ok: true };
}

/** Current staff member + tenant + permissions (for the admin UI shell). */
export async function me(tenantId: Types.ObjectId, userId: Types.ObjectId) {
  const tenant = await runAsPlatform('me: tenant', () =>
    Tenant.findOne({ _id: tenantId }).select('name slug status businessType planId trialEndsAt currency timezone acceptingOrders templateKey').lean(),
  );
  const user = await User.findOne({ _id: userId }).select('name email phone roleId branchIds').lean();
  const role = user ? await Role.findOne({ _id: user.roleId }).select('name permissions').lean() : null;
  return { tenant, user, role, vocab: vocabFor(tenant?.businessType), rootDomain: process.env.ROOT_DOMAIN ?? 'localhost' };
}

// ---------------------------------------------------------------------------
// Platform staff (Super Admin): password + mandatory TOTP
// ---------------------------------------------------------------------------
const PlatformLoginInput = z
  .object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(128), code: z.string().trim().max(10) })
  .strict();

export async function platformLogin(body: unknown, ua?: string, ip?: string) {
  const { email, password, code } = PlatformLoginInput.parse(body);
  const user = await PlatformUser.findOne({ email, active: true }).select('+passwordHash +totpSecret').lean();
  const ok = await verifyPasswordOrDummy(password, user?.passwordHash);
  if (!ok || !user || !verifyTotp(user.totpSecret, code)) {
    await audit({ actorType: 'platform', action: 'platform.login_failed', target: email, meta: { ip } });
    throw new AppError(401, 'INVALID_LOGIN', 'Wrong email, password or 2FA code');
  }
  await PlatformUser.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await audit({ actorType: 'platform', actorId: user._id, action: 'platform.login', meta: { ip } });
  return {
    accessToken: signAccess('platform', String(user._id), { role: user.role, typ: 'platform' }),
    refreshToken: await createSession('platform', user._id, undefined, ua),
  };
}

export async function platformRefresh(refreshToken: unknown, ua?: string) {
  const { session, refreshToken: next } = await rotateSession('platform', String(refreshToken ?? ''), ua);
  const user = await PlatformUser.findOne({ _id: session.userId, active: true }).select('role').lean();
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
  return { accessToken: signAccess('platform', String(user._id), { role: user.role, typ: 'platform' }), refreshToken: next };
}
