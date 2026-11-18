import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

const CategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9-]{1,80}$/ },
    image: { type: String, maxlength: 2048 },
    sort: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
    branchIds: [{ type: Schema.Types.ObjectId, ref: 'Branch' }],
  },
  { timestamps: true, collection: 'categories' },
);
CategorySchema.plugin(tenantScopePlugin);
CategorySchema.index({ tenantId: 1, slug: 1 }, { unique: true });
CategorySchema.index({ tenantId: 1, sort: 1 });

export type CategoryAttrs = InferSchemaType<typeof CategorySchema>;
export const Category = model('Category', CategorySchema);
