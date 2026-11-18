import { z } from 'zod';
import { Coupon, Customer, Order } from '../models';
import type { CouponAttrs } from '../models/Coupon';
import { requireTenantId } from '../db/tenantContext';
import { badRequest, conflict } from './errors';

export const CouponCreate = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3-30 letters, numbers, - or _'),
    description: z.string().trim().max(200).optional(),
    type: z.enum(['percent', 'fixed', 'free_delivery']),
    value: z.number().min(0).max(10_000_000).default(0),
    maxDiscount: z.number().min(0).max(10_000_000).optional(),
    minOrder: z.number().min(0).max(10_000_000).default(0),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).optional(),
    oncePerCustomer: z.boolean().default(false),
    firstOrderOnly: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((c) => c.type !== 'percent' || (c.value > 0 && c.value <= 100), { message: 'Percent must be between 1 and 100', path: ['value'] })
  .refine((c) => c.type !== 'fixed' || c.value > 0, { message: 'Enter the discount amount', path: ['value'] })
  .refine((c) => !c.startsAt || !c.endsAt || c.startsAt < c.endsAt, { message: 'End date must be after start date', path: ['endsAt'] });

export const CouponUpdate = z
  .object({
    description: z.string().trim().max(200).optional(),
    value: z.number().min(0).max(10_000_000).optional(),
    maxDiscount: z.number().min(0).max(10_000_000).nullable().optional(),
    minOrder: z.number().min(0).max(10_000_000).optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    oncePerCustomer: z.boolean().optional(),
    firstOrderOnly: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export interface AppliedCoupon {
  code: string;
  discount: number;
  freeDelivery: boolean;
  label: string;
}

/**
 * Validates a code against the cart and returns the discount. Throws a friendly 400 with the
 * reason when it doesn't apply. `phone` enables once-per-customer / first-order checks at checkout.
 */
export async function evaluateCoupon(
  rawCode: string,
  ctx: { subtotal: number; deliveryFee: number; phone?: string },
): Promise<AppliedCoupon & { coupon: CouponAttrs & { _id: unknown } }> {
  requireTenantId();
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw badRequest("That code isn't valid");
  const c = await Coupon.findOne({ code }).lean();
  const now = new Date();
  if (!c || !c.active) throw badRequest("That code isn't valid");
  if (c.startsAt && c.startsAt > now) throw badRequest("That code isn't active yet");
  if (c.endsAt && c.endsAt < now) throw badRequest('That code has expired');
  if (c.usageLimit && c.usedCount >= c.usageLimit) throw badRequest('That code has been fully used');
  if (c.minOrder && ctx.subtotal < c.minOrder) throw badRequest(`Add items worth ${c.minOrder - ctx.subtotal} more to use this code`);
  if (ctx.phone && (c.oncePerCustomer || c.firstOrderOnly)) {
    const customer = await Customer.findOne({ phone: ctx.phone }).select('_id').lean();
    if (customer) {
      if (c.firstOrderOnly && (await Order.exists({ customerId: customer._id, status: { $ne: 'cancelled' } }))) {
        throw badRequest('This code is for first orders only');
      }
      if (c.oncePerCustomer && (await Order.exists({ customerId: customer._id, 'coupon.code': code, status: { $ne: 'cancelled' } }))) {
        throw badRequest("You've already used this code");
      }
    }
  }
  let discount = 0;
  let freeDelivery = false;
  if (c.type === 'percent') {
    discount = Math.round((ctx.subtotal * c.value) / 100);
    if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
  } else if (c.type === 'fixed') {
    discount = Math.min(c.value, ctx.subtotal);
  } else {
    freeDelivery = true;
  }
  const label = c.type === 'percent' ? `${c.value}% off` : c.type === 'fixed' ? `${c.value} off` : 'Free delivery';
  return { code, discount, freeDelivery, label, coupon: c as CouponAttrs & { _id: unknown } };
}

/** Atomically counts a use; fails if the limit was reached by a concurrent order. */
export async function redeemCoupon(code: string) {
  requireTenantId();
  const res = await Coupon.updateOne(
    { code, active: true, $or: [{ usageLimit: null }, { usageLimit: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
    { $inc: { usedCount: 1 } },
  );
  if (res.modifiedCount !== 1) throw conflict('That code has just been fully used');
}

export async function releaseCoupon(code: string) {
  await Coupon.updateOne({ code, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
}
