import { Order, Tenant } from '../models';
import { requireTenantId, runAsPlatform } from '../db/tenantContext';

/** Sales reports for the last N days (plan §9 "Reports"), in the tenant's timezone. */
export async function salesReport(daysRaw: unknown) {
  const tenantId = requireTenantId();
  const days = Math.min(Math.max(Number(daysRaw) || 30, 1), 365);
  const tenant = await runAsPlatform('reports: tz', () => Tenant.findOne({ _id: tenantId }).select('timezone').lean());
  const tz = tenant?.timezone ?? 'Asia/Karachi';
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const match = { createdAt: { $gte: since } };
  const valid = { ...match, status: { $ne: 'cancelled' } };

  const [summary] = await Order.aggregate([
    { $match: valid },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        revenue: { $sum: '$totals.total' },
        discounts: { $sum: '$totals.discount' },
        deliveryFees: { $sum: '$totals.deliveryFee' },
        customers: { $addToSet: '$customerId' },
      },
    },
  ]);
  const cancelled = await Order.countDocuments({ ...match, status: 'cancelled' });
  const repeat = await Order.aggregate([
    { $match: valid },
    { $group: { _id: '$customerId', n: { $sum: 1 } } },
    { $group: { _id: null, repeaters: { $sum: { $cond: [{ $gt: ['$n', 1] }, 1, 0] } }, total: { $sum: 1 } } },
  ]);
  const byDay = await Order.aggregate([
    { $match: valid },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, orders: { $sum: 1 }, revenue: { $sum: '$totals.total' } } },
    { $sort: { _id: 1 } },
  ]);
  const byItem = await Order.aggregate([
    { $match: valid },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
    { $sort: { revenue: -1 } },
    { $limit: 20 },
  ]);
  const byType = await Order.aggregate([
    { $match: valid },
    { $group: { _id: '$type', orders: { $sum: 1 }, revenue: { $sum: '$totals.total' } } },
  ]);
  const byHour = await Order.aggregate([
    { $match: valid },
    { $group: { _id: { $hour: { date: '$createdAt', timezone: tz } }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const byCoupon = await Order.aggregate([
    { $match: { ...valid, 'coupon.code': { $exists: true } } },
    { $group: { _id: '$coupon.code', uses: { $sum: 1 }, discount: { $sum: '$coupon.discount' }, revenue: { $sum: '$totals.total' } } },
    { $sort: { uses: -1 } },
  ]);

  const orders = summary?.orders ?? 0;
  const revenue = summary?.revenue ?? 0;
  return {
    days,
    summary: {
      orders,
      revenue,
      averageOrderValue: orders ? Math.round(revenue / orders) : 0,
      discounts: summary?.discounts ?? 0,
      deliveryFees: summary?.deliveryFees ?? 0,
      cancelled,
      customers: (summary?.customers ?? []).filter(Boolean).length,
      repeatCustomerRate: repeat[0]?.total ? Math.round((repeat[0].repeaters / repeat[0].total) * 100) : 0,
    },
    byDay: byDay.map((d) => ({ date: d._id, orders: d.orders, revenue: d.revenue })),
    byItem: byItem.map((d) => ({ name: d._id, qty: d.qty, revenue: d.revenue })),
    byType: byType.map((d) => ({ type: d._id, orders: d.orders, revenue: d.revenue })),
    byHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: byHour.find((x) => x._id === h)?.orders ?? 0 })),
    byCoupon: byCoupon.map((d) => ({ code: d._id, uses: d.uses, discount: d.discount, revenue: d.revenue })),
  };
}
