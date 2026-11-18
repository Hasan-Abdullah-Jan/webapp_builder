import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

/** Discount codes (plan §7 "Coupons and promotions"). */
const CouponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z0-9_-]{3,30}$/ },
    description: { type: String, maxlength: 200 },
    type: { type: String, enum: ['percent', 'fixed', 'free_delivery'], required: true },
    value: { type: Number, default: 0, min: 0 }, // % (1-100) or amount
    maxDiscount: { type: Number, min: 0 }, // cap for % codes
    minOrder: { type: Number, default: 0, min: 0 },
    startsAt: Date,
    endsAt: Date,
    usageLimit: { type: Number, min: 1 }, // total uses; empty = unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    oncePerCustomer: { type: Boolean, default: false },
    firstOrderOnly: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'coupons' },
);
CouponSchema.plugin(tenantScopePlugin);
CouponSchema.index({ tenantId: 1, code: 1 }, { unique: true });
CouponSchema.index({ tenantId: 1, active: 1, createdAt: -1 });

export type CouponAttrs = InferSchemaType<typeof CouponSchema>;
export const Coupon = model('Coupon', CouponSchema);
