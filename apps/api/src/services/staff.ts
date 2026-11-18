import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { Role, Tenant, User, audit } from '../models';
import { requireTenantId, runAsPlatform } from '../db/tenantContext';
import { hashPassword } from './password';
import { revokeAllForUser } from './tokens';
import { assertWithinLimit } from './limits';
import { badRequest, forbidden, notFound } from './errors';

const objectId = z.string().refine(isValidObjectId, 'invalid id');

const StaffCreate = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/).optional(),
    roleId: objectId,
    branchIds: z.array(objectId).max(100).optional(),
    password: z.string().min(8).max(128),
  })
  .strict();
const StaffUpdate = StaffCreate.partial().extend({ active: z.boolean().optional() }).strict();

async function ownerId() {
  const tenantId = requireTenantId();
  const t = await runAsPlatform('staff: owner id', () => Tenant.findOne({ _id: tenantId }).select('ownerId').lean());
  return t?.ownerId;
}

async function assertRole(roleId: string) {
  const role = await Role.findOne({ _id: roleId }).select('name').lean();
  if (!role) throw badRequest('Unknown role');
  if (role.name === 'Owner') throw forbidden('There can only be one owner');
}

export async function listStaff() {
  requireTenantId();
  const [users, roles] = await Promise.all([
    User.find({}).select('name email phone roleId branchIds active lastLoginAt createdAt').sort({ createdAt: 1 }).lean(),
    Role.find({}).select('name permissions system').lean(),
  ]);
  return { users, roles, ownerId: await ownerId() };
}

export async function createStaff(body: unknown, actorId?: Types.ObjectId) {
  const tenantId = requireTenantId();
  const data = StaffCreate.parse(body);
  await assertRole(data.roleId);
  await assertWithinLimit('staff');
  const { password, ...rest } = data;
  const user = await User.create({ ...rest, passwordHash: await hashPassword(password) });
  await audit({ tenantId, actorType: 'staff', actorId, action: 'staff.create', target: data.email });
  const { passwordHash: _p, ...safe } = user.toObject();
  return safe;
}

export async function updateStaff(id: string, body: unknown, actorId?: Types.ObjectId) {
  const tenantId = requireTenantId();
  if (!isValidObjectId(id)) throw notFound('Staff member');
  const data = StaffUpdate.parse(body);
  const owner = await ownerId();
  if (owner?.equals(id) && (data.roleId || data.active === false)) throw forbidden("The owner's role can't be changed");
  if (data.roleId) await assertRole(data.roleId);
  const { password, ...rest } = data;
  const $set: Record<string, unknown> = { ...rest };
  if (password) $set.passwordHash = await hashPassword(password);
  const user = await User.findOneAndUpdate({ _id: id }, { $set }, { new: true, runValidators: true })
    .select('name email phone roleId branchIds active').lean();
  if (!user) throw notFound('Staff member');
  if (password || data.active === false) await revokeAllForUser(user._id);
  await audit({ tenantId, actorType: 'staff', actorId, action: 'staff.update', target: String(id) });
  return user;
}

export async function deleteStaff(id: string, actorId?: Types.ObjectId) {
  const tenantId = requireTenantId();
  if (!isValidObjectId(id)) throw notFound('Staff member');
  const owner = await ownerId();
  if (owner?.equals(id)) throw forbidden("The owner can't be removed");
  if (actorId?.equals(id)) throw forbidden("You can't remove yourself");
  const res = await User.deleteOne({ _id: id });
  if (!res.deletedCount) throw notFound('Staff member');
  await revokeAllForUser(new Types.ObjectId(id));
  await audit({ tenantId, actorType: 'staff', actorId, action: 'staff.delete', target: String(id) });
  return { deleted: true };
}
