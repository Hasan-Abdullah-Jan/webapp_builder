import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

// End customers are stored per tenant (plan §2): the same phone at two stores is
// two separate accounts, so tenants never see each other's customers.
const AddressSchema = new Schema(
  {
    label: { type: String, maxlength: 40 },
    line1: { type: String, required: true, maxlength: 300 },
    city: { type: String, maxlength: 80 },
    geo: { type: { type: String, enum: ['Point'] }, coordinates: [Number] },
  },
  { _id: true },
);

const CustomerSchema = new Schema(
  {
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, trim: true, maxlength: 120 },
    addresses: [AddressSchema],
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    marketingOptIn: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'customers' },
);
CustomerSchema.plugin(tenantScopePlugin);
CustomerSchema.index({ tenantId: 1, phone: 1 }, { unique: true });
CustomerSchema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
CustomerSchema.index({ tenantId: 1, createdAt: -1 });

export type CustomerAttrs = InferSchemaType<typeof CustomerSchema>;
export const Customer = model('Customer', CustomerSchema);
