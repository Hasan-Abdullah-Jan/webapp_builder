import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// Platform-scoped: one document per store. Not tenant-scoped (it IS the tenant).
export const TENANT_STATUSES = ['draft', 'active', 'suspended', 'deleted', 'provisioning_failed'] as const;
export const BUSINESS_TYPES = [
  'restaurant', 'cafe', 'bakery', 'grocery', 'pharmacy', 'fashion', 'electronics', 'salon', 'other',
] as const;

const TenantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String, required: true, lowercase: true, trim: true,
      match: /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/,
    },
    businessType: { type: String, enum: BUSINESS_TYPES, default: 'restaurant' },
    status: { type: String, enum: TENANT_STATUSES, default: 'draft' },
    planId: { type: String, default: 'trial' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    locale: { type: String, default: 'en-PK' },
    currency: { type: String, default: 'PKR', uppercase: true, minlength: 3, maxlength: 3 },
    timezone: { type: String, default: 'Asia/Karachi' },
  },
  { timestamps: true, collection: 'tenants' },
);

TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ status: 1, createdAt: -1 });
TenantSchema.index({ ownerId: 1 });

export type TenantAttrs = InferSchemaType<typeof TenantSchema>;
export type TenantDoc = HydratedDocument<TenantAttrs>;
export const Tenant = model('Tenant', TenantSchema);
