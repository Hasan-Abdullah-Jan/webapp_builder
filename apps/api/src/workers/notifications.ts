import { Types } from 'mongoose';
import { Order, Tenant, User } from '../models';
import { runAsPlatform, runWithTenant } from '../db/tenantContext';
import { bus } from '../services/events';

/**
 * Notification worker (plan §11.6). Providers are pluggable; v1 ships a console provider so
 * flows are visible in logs. Wire SMS (local gateway), WhatsApp Cloud API and email
 * (Resend/SES) by implementing `Notifier` and setting NOTIFIER=<name>.
 */
export interface Notifier {
  send(msg: { channel: 'sms' | 'email' | 'whatsapp'; to: string; subject?: string; text: string }): Promise<void>;
}

const consoleNotifier: Notifier = {
  async send(m) {
    if (process.env.NODE_ENV === 'test') return;
    const to = m.to.replace(/.(?=.{3})/g, '*'); // mask PII in logs
    console.log(`[notify:${m.channel}] to=${to} ${m.subject ? `subject="${m.subject}" ` : ''}${m.text}`);
  },
};

let notifier: Notifier = consoleNotifier;
export function setNotifier(n: Notifier) {
  notifier = n;
}

const STATUS_TEXT: Record<string, string> = {
  confirmed: 'has been accepted',
  preparing: 'is being prepared',
  ready: 'is ready',
  out_for_delivery: 'is out for delivery',
  delivered: 'has been delivered',
  completed: 'is complete',
  cancelled: 'was cancelled',
};

async function storeName(tenantId: string) {
  const t = await runAsPlatform('notify: store name', () =>
    Tenant.findOne({ _id: tenantId }).select('name ownerId').lean());
  return t;
}

export function startNotificationWorker() {
  bus.onEvent('order.created', async (e) => {
    try {
      const tenant = await storeName(e.tenantId);
      const tenantId = new Types.ObjectId(e.tenantId);
      const order = await runWithTenant({ tenantId }, () => Order.findOne({ _id: e.orderId }).select('customer totals').lean());
      if (order?.customer?.phone) {
        await notifier.send({
          channel: 'sms', to: order.customer.phone,
          text: `${tenant?.name}: we received your order #${e.orderNo} (Rs. ${order.totals?.total ?? ''}). We'll update you here.`,
        });
      }
      const owner = tenant?.ownerId
        ? await runWithTenant({ tenantId }, () => User.findOne({ _id: tenant.ownerId }).select('email').lean())
        : null;
      if (owner?.email) {
        await notifier.send({ channel: 'email', to: owner.email, subject: `New order #${e.orderNo}`, text: 'Open your order board to accept it.' });
      }
    } catch (err) {
      console.error('[notify] order.created failed', (err as Error).message);
    }
  });

  bus.onEvent('order.status_changed', async (e) => {
    try {
      const text = STATUS_TEXT[e.status];
      if (!text) return;
      const tenant = await storeName(e.tenantId);
      const order = await runWithTenant({ tenantId: new Types.ObjectId(e.tenantId) }, () =>
        Order.findOne({ _id: e.orderId }).select('customer').lean());
      if (order?.customer?.phone) {
        await notifier.send({ channel: 'sms', to: order.customer.phone, text: `${tenant?.name}: your order #${e.orderNo} ${text}.` });
      }
    } catch (err) {
      console.error('[notify] order.status_changed failed', (err as Error).message);
    }
  });

  bus.onEvent('site.published', (e) => {
    // Plan §11.2 step 4: purge CDN/ISR cache tag `tenant:{id}`. The storefront revalidates on a
    // short TTL in v1; hook a cache purge here when a CDN is in front.
    if (process.env.NODE_ENV !== 'test') console.log(`[publish] tenant ${e.tenantId} published v${e.version}`);
  });
}
