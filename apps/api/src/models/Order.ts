import { Schema, model, type InferSchemaType } from 'mongoose';
import { tenantScopePlugin } from '../db/plugins/tenantScope';

export const ORDER_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status transitions (state machine for PATCH /orders/:id/status). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed'],
  out_for_delivery: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

const OrderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    variant: String,
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    modifiers: [{ name: String, price: Number, _id: false }],
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const OrderSchema = new Schema(
  {
    orderNo: { type: Number, required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customer: { name: String, phone: String, address: String }, // snapshot at order time
    items: { type: [OrderItemSchema], validate: (v: unknown[]) => v.length > 0 },
    totals: {
      subtotal: { type: Number, required: true, min: 0 },
      deliveryFee: { type: Number, default: 0, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      tax: { type: Number, default: 0, min: 0 },
      total: { type: Number, required: true, min: 0 },
    },
    type: { type: String, enum: ['delivery', 'pickup', 'dine-in'], required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: [
      {
        status: { type: String, enum: ORDER_STATUSES },
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        _id: false,
      },
    ],
    payment: {
      method: { type: String, enum: ['cod', 'online'], default: 'cod' },
      status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
      gatewayRef: String,
    },
    riderId: { type: Schema.Types.ObjectId, ref: 'User' },
    idempotencyKey: { type: String, maxlength: 128 },
  },
  { timestamps: true, collection: 'orders' },
);
OrderSchema.plugin(tenantScopePlugin);
OrderSchema.index({ tenantId: 1, orderNo: 1 }, { unique: true });
OrderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ tenantId: 1, branchId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
OrderSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

export type OrderAttrs = InferSchemaType<typeof OrderSchema>;
export const Order = model('Order', OrderSchema);
