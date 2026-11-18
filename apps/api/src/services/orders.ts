import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { Order, ORDER_STATUSES, ORDER_TRANSITIONS, type OrderStatus } from '../models';
import { requireTenantId } from '../db/tenantContext';
import { createCrudService } from './crud';
import { badRequest, conflict, notFound } from './errors';
import { bus } from './events';

// Orders are created by the storefront checkout; staff read them and move status.
const readOnly = z.never();
export const orderReads = createCrudService(Order, {
  name: 'Order',
  createSchema: readOnly,
  updateSchema: readOnly,
  filterFields: ['status', 'branchId', 'customerId', 'type'],
});

const StatusPatch = z.object({ status: z.string(), reason: z.string().trim().max(300).optional() }).strict();

export async function updateOrderStatus(id: string, body: unknown, userId?: Types.ObjectId) {
  const tenantId = requireTenantId();
  if (!isValidObjectId(id)) throw notFound('Order');
  const { status, reason } = StatusPatch.parse(body);
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) throw badRequest('Unknown status');
  const next = status as OrderStatus;

  const order = await Order.findOne({ _id: id }).select('status type').lean();
  if (!order) throw notFound('Order');
  const current = order.status as OrderStatus;
  if (!ORDER_TRANSITIONS[current].includes(next)) {
    throw badRequest(`Cannot move order from ${current} to ${next}`);
  }
  if (next === 'out_for_delivery' && order.type !== 'delivery') throw badRequest('Only delivery orders go out for delivery');
  if (next === 'cancelled' && !reason) throw badRequest('Please give a reason for rejecting or cancelling');

  // Compare-and-set on the current status prevents lost updates from concurrent staff.
  const updated = await Order.findOneAndUpdate(
    { _id: id, status: current },
    { $set: { status: next }, $push: { statusHistory: { status: next, at: new Date(), by: userId, reason } } },
    { new: true },
  ).lean();
  if (!updated) throw conflict('Order was updated by someone else, refresh and retry');
  bus.emitEvent('order.status_changed', {
    tenantId: String(tenantId), orderId: String(updated._id), orderNo: updated.orderNo, status: next,
    branchId: updated.branchId ? String(updated.branchId) : undefined,
  });
  return updated;
}

/** Live board: all open orders plus today's closed ones. */
export async function board() {
  requireTenantId();
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  return Order.find({
    $or: [
      { status: { $in: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] } },
      { createdAt: { $gte: since } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();
}

const CSV_COLS = ['orderNo', 'createdAt', 'status', 'type', 'customer', 'phone', 'items', 'subtotal', 'deliveryFee', 'tax', 'total'];
const csvCell = (v: unknown) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCsv(days = 30) {
  requireTenantId();
  const since = new Date(Date.now() - Math.min(days, 366) * 24 * 3600 * 1000);
  const orders = await Order.find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(20000).lean();
  const rows = orders.map((o) => [
    o.orderNo, o.createdAt?.toISOString(), o.status, o.type, o.customer?.name, o.customer?.phone,
    o.items.map((i) => `${i.quantity}x ${i.name}`).join('; '),
    o.totals?.subtotal, o.totals?.deliveryFee, o.totals?.tax, o.totals?.total,
  ].map(csvCell).join(','));
  return [CSV_COLS.join(','), ...rows].join('\n');
}
