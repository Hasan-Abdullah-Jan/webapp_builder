import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

// Plan §4.3. One mutable `draft` per tenant; each publish creates an immutable
// `published` version (version + 1) so tenants can roll back.
const SiteConfigSchema = new Schema(
  {
    version: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['draft', 'published'], required: true },
    theme: { type: Schema.Types.Mixed, default: {} },
    layout: { type: Schema.Types.Mixed, default: {} },
    features: { type: Schema.Types.Mixed, default: {} },
    seo: { type: Schema.Types.Mixed, default: {} },
    settings: { type: Schema.Types.Mixed, default: {} },
    publishedAt: Date,
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'siteConfigs', minimize: false },
);
SiteConfigSchema.plugin(tenantScopePlugin);
// Exactly one draft per tenant.
SiteConfigSchema.index({ tenantId: 1 }, { unique: true, partialFilterExpression: { status: 'draft' }, name: 'one_draft_per_tenant' });
// Published versions are unique per tenant; latest is found via this index.
SiteConfigSchema.index(
  { tenantId: 1, version: -1 },
  { unique: true, partialFilterExpression: { status: 'published' }, name: 'published_version' },
);

export type SiteConfigAttrs = InferSchemaType<typeof SiteConfigSchema>;
export const SiteConfig = model('SiteConfig', SiteConfigSchema);
