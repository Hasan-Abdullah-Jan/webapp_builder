import { Order, Tenant } from '../models';
import { requireTenantId, runAsPlatform } from '../db/tenantContext';
import { readiness } from './siteConfig';
import { usage } from './limits';

function startOfDay(timezone: string) {
  // Midnight in the tenant's timezone, as a UTC Date.
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offsetMs = local.getTime() - now.getTime();
  const midnightLocal = new Date(local);
  midnightLocal.setHours(0, 0, 0, 0);
  return new Date(midnightLocal.getTime() - offsetMs);
}

export async function dashboard() {
  const tenantId = requireTenantId();
  const tenant = await runAsPlatform('dashboard: tenant', () =>
    Tenant.findOne({ _id: tenantId }).select('name slug status planId trialEndsAt timezone currency acceptingOrders').lean(),
  );
  const since = startOfDay(tenant?.timezone ?? 'Asia/Karachi');
  const [today] = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'cancelled' } } },
    { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$totals.total' } } },
  ]);
  const live = await Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] } });
  const topItems = await Order.aggregate([
    { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) }, status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
    { $sort: { qty: -1 } },
    { $limit: 5 },
  ]);
  const last7 = await Order.aggregate([
    { $match: { createdAt: { $gte: new Date(since.getTime() - 6 * 24 * 3600 * 1000) }, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tenant?.timezone ?? 'Asia/Karachi' } },
        orders: { $sum: 1 },
        revenue: { $sum: '$totals.total' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const orders = today?.orders ?? 0;
  const revenue = today?.revenue ?? 0;
  return {
    tenant,
    today: { orders, revenue, averageOrderValue: orders ? Math.round(revenue / orders) : 0 },
    liveOrders: live,
    topItems: topItems.map((t) => ({ name: t._id, qty: t.qty, revenue: t.revenue })),
    last7Days: last7.map((d) => ({ date: d._id, orders: d.orders, revenue: d.revenue })),
    setup: await readiness(),
    plan: await usage(),
  };
}

export async function setAcceptingOrders(accepting: boolean) {
  const tenantId = requireTenantId();
  await runAsPlatform('store switch: own tenant', () =>
    Tenant.updateOne({ _id: tenantId }, { $set: { acceptingOrders: accepting } }),
  );
  return { acceptingOrders: accepting };
}
