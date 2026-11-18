import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

/** Fine-grained permission strings (plan §2). `*` = everything inside the tenant. */
export const PERMISSIONS = [
  '*',
  'catalog.read', 'catalog.write',
  'branches.read', 'branches.write',
  'customers.read', 'customers.write',
  'orders.read', 'orders.update_status',
  'site.read', 'site.write', 'site.publish',
  'staff.manage', 'billing.manage', 'store.delete',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const RoleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    permissions: [{ type: String, enum: PERMISSIONS }],
    system: { type: Boolean, default: false }, // built-in roles cannot be deleted
  },
  { timestamps: true, collection: 'roles' },
);
RoleSchema.plugin(tenantScopePlugin);
RoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export type RoleAttrs = InferSchemaType<typeof RoleSchema>;
export const Role = model('Role', RoleSchema);

export const DEFAULT_ROLES: { name: string; permissions: Permission[] }[] = [
  { name: 'Owner', permissions: ['*'] },
  {
    name: 'Manager',
    permissions: [
      'catalog.read', 'catalog.write', 'branches.read', 'branches.write', 'customers.read',
      'customers.write', 'orders.read', 'orders.update_status', 'site.read', 'site.write', 'site.publish',
    ],
  },
  { name: 'Branch Manager', permissions: ['catalog.read', 'branches.read', 'orders.read', 'orders.update_status'] },
  { name: 'Staff', permissions: ['orders.read', 'orders.update_status'] },
];
