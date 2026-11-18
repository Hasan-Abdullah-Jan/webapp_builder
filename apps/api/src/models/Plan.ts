import { Schema, model, type InferSchemaType } from 'mongoose';

// Platform-scoped. Plans are data, not code (plan §15); defaults are seeded on startup.
const PlanSchema = new Schema(
  {
    key: { type: String, required: true, lowercase: true, match: /^[a-z0-9-]{2,30}$/ },
    name: { type: String, required: true, maxlength: 60 },
    pricePkr: { type: Number, required: true, min: 0 },
    rank: { type: Number, required: true }, // ordering for "min plan" checks
    limits: {
      products: { type: Number, default: -1 }, // -1 = unlimited
      branches: { type: Number, default: -1 },
      staff: { type: Number, default: -1 },
      ordersPerMonth: { type: Number, default: -1 },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'plans' },
);
PlanSchema.index({ key: 1 }, { unique: true });

export type PlanAttrs = InferSchemaType<typeof PlanSchema>;
export const Plan = model('Plan', PlanSchema);

export const DEFAULT_PLANS = [
  { key: 'trial', name: 'Free trial', pricePkr: 0, rank: 2, limits: { products: 1000, branches: 5, staff: 15, ordersPerMonth: 10000 } },
  { key: 'starter', name: 'Starter', pricePkr: 4999, rank: 1, limits: { products: 150, branches: 1, staff: 3, ordersPerMonth: 1000 } },
  { key: 'pro', name: 'Pro', pricePkr: 12999, rank: 2, limits: { products: 1000, branches: 5, staff: 15, ordersPerMonth: 10000 } },
  { key: 'business', name: 'Business', pricePkr: 29999, rank: 3, limits: { products: -1, branches: 25, staff: 50, ordersPerMonth: 50000 } },
  { key: 'enterprise', name: 'Enterprise', pricePkr: 0, rank: 4, limits: { products: -1, branches: -1, staff: -1, ordersPerMonth: -1 } },
];

export async function seedPlans() {
  for (const p of DEFAULT_PLANS) {
    await Plan.updateOne({ key: p.key }, { $setOnInsert: p }, { upsert: true });
  }
}
