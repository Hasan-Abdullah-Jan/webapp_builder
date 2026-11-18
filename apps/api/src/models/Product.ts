import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

const VariantSchema = new Schema(
  { name: { type: String, required: true, maxlength: 80 }, price: { type: Number, required: true, min: 0 } },
  { _id: true },
);
const BranchOverrideSchema = new Schema(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    price: { type: Number, min: 0 },
    available: { type: Boolean },
  },
  { _id: false },
);

const ProductSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9-]{1,120}$/ },
    description: { type: String, maxlength: 4000 },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    images: [{ type: String, maxlength: 2048 }],
    basePrice: { type: Number, required: true, min: 0 },
    variants: [VariantSchema],
    modifierGroupIds: [{ type: Schema.Types.ObjectId }],
    tags: [{ type: String, lowercase: true, trim: true, maxlength: 40 }],
    branchOverrides: [BranchOverrideSchema],
    stock: { type: Number, min: 0 }, // undefined = not tracked
    active: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'products' },
);
ProductSchema.plugin(tenantScopePlugin);
ProductSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
ProductSchema.index({ tenantId: 1, categoryId: 1, sort: 1 });
ProductSchema.index({ tenantId: 1, tags: 1 });
ProductSchema.index({ tenantId: 1, active: 1, createdAt: -1 });

export type ProductAttrs = InferSchemaType<typeof ProductSchema>;
export const Product = model('Product', ProductSchema);
