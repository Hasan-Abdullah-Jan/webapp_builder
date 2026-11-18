import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

const PointSchema = new Schema(
  { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } },
  { _id: false },
);
const PolygonSchema = new Schema(
  { type: { type: String, enum: ['Polygon', 'MultiPolygon'], required: true }, coordinates: { type: Array, required: true } },
  { _id: false },
);

const BranchSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    address: { type: String, trim: true, maxlength: 500 },
    phone: { type: String, trim: true, maxlength: 20 },
    geo: { type: PointSchema },
    deliveryZones: { type: PolygonSchema },
    hours: { type: Schema.Types.Mixed, default: {} },
    isOpen: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'branches' },
);
BranchSchema.plugin(tenantScopePlugin);
BranchSchema.index({ tenantId: 1, name: 1 });
BranchSchema.index({ tenantId: 1, geo: '2dsphere' }, { sparse: true });
BranchSchema.index({ tenantId: 1, deliveryZones: '2dsphere' }, { sparse: true });

export type BranchAttrs = InferSchemaType<typeof BranchSchema>;
export const Branch = model('Branch', BranchSchema);
