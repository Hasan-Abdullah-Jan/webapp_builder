import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

// Tenant staff accounts (owners, managers, kitchen, riders).
const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
    passwordHash: { type: String, select: false },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true, collection: 'users' },
);
UserSchema.plugin(tenantScopePlugin);
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
UserSchema.index({ tenantId: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
UserSchema.index({ tenantId: 1, roleId: 1 });

export type UserAttrs = InferSchemaType<typeof UserSchema>;
export const User = model('User', UserSchema);
