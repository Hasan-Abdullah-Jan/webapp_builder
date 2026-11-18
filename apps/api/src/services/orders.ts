import { isValidObjectId, Types } from 'mongoose';
import { Order, ORDER_STATUSES, ORDER_TRANSITIONS, type OrderStatus } from '../models';
import { requireTenantId } from '../db/tenantContext';
import { createCrudService } from './crud';
import { OrderStatusPatch } from './validation';
import { badRequest, conflict, notFound } from './errors';
import { z } from 'zod';

// Orders are created by the checkout flow (not built yet); admin can read them and move status.
const readOnly = z.never();
export const orderReads = createCrudService(Order, {
  name: 'Order',
  createSchema: readOnly,
  updateSchema: readOnly,
  filterFields: ['status', 'branchId', 'customerId', 'type'],
});

export async function updateOrderStatus(id: string, body: unknown, userId?: Types.ObjectId) {
  requireTenantId();
  if (!isValidObjectId(id)) throw notFound('Order');
  const { status } = OrderStatusPatch.parse(body);
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw badRequest('Unknown status');
  const next = status as OrderStatus;

  const order = await Order.findOne({ _id: id }).select('status').lean();
  if (!order) throw notFound('Order');
  const current = order.status as OrderStatus;
  if (!ORDER_TRANSITIONS[current].includes(next)) {
    throw badRequest(`Cannot move order from ${current} to ${next}`);
  }
  // Compare-and-set on the current status prevents lost updates from concurrent staff.
  const updated = await Order.findOneAndUpdate(
    { _id: id, status: current },
    { $set: { status: next }, $push: { statusHistory: { status: next, at: new Date(), by: userId } } },
    { new: true },
  ).lean();
  if (!updated) throw conflict('Order was updated by someone else, refresh and retry');
  return updated;
}
