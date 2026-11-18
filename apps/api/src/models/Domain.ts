import { Schema, model, type InferSchemaType } from 'mongoose';

// Platform-scoped (plan §4.2): resolved by hostname BEFORE a tenant is known,
// so it is not run through the tenant plugin. Always filter by tenantId when
// accessing it on behalf of a tenant.
const DomainSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, immutable: true },
    hostname: { type: String, required: true, lowercase: true, trim: true, maxlength: 253 },
    type: { type: String, enum: ['subdomain', 'custom'], required: true },
    verified: { type: Boolean, default: false },
    sslStatus: { type: String, enum: ['pending', 'active', 'failed'], default: 'pending' },
    primary: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'domains' },
);

DomainSchema.index({ hostname: 1 }, { unique: true });
DomainSchema.index({ tenantId: 1, primary: -1 });

export type DomainAttrs = InferSchemaType<typeof DomainSchema>;
export const Domain = model('Domain', DomainSchema);
