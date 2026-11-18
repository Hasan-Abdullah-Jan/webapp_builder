import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { Branch, Category, Customer, ModifierGroup, Order, Product, SiteConfig, nextSequence } from '../models';
import { requireTenantId } from '../db/tenantContext';
import { AppError, badRequest, notFound } from './errors';
import { bus } from './events';

export interface StoreTenant {
  _id: Types.ObjectId;
  status?: string;
  name: string;
  slug: string;
  currency?: string | null;
  timezone?: string | null;
  acceptingOrders?: boolean | null;
}

type Flags = Record<string, { enabled?: boolean } & Record<string, unknown>>;

const PUBLIC_BRANCH_FIELDS = 'name address phone geo hours isOpen deliveryFee minOrder deliveryRadiusKm prepTimeMins';

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function localNow(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: get('weekday').slice(0, 3).toLowerCase(), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Open if the manual switch is on and (no hours configured, or now is inside today's window). */
export function isBranchOpenNow(branch: { isOpen?: boolean | null; hours?: unknown }, timezone = 'Asia/Karachi') {
  if (branch.isOpen === false) return false;
  const hours = (branch.hours ?? {}) as Record<string, { open?: string; close?: string; closed?: boolean }>;
  if (!Object.keys(hours).length) return true;
  const { day, minutes } = localNow(timezone);
  const today = hours[day];
  const yesterday = hours[DAYS[(DAYS.indexOf(day) + 6) % 7]];
  const inWindow = (w?: { open?: string; close?: string; closed?: boolean }, offset = 0) => {
    if (!w || w.closed || !w.open || !w.close) return false;
    const o = toMin(w.open);
    let c = toMin(w.close);
    if (c <= o) c += 24 * 60; // closes after midnight
    const t = minutes + offset;
    return t >= o && t < c;
  };
  return inWindow(today) || inWindow(yesterday, 24 * 60);
}

// ---------------------------------------------------------------------------
// Config + menu
// ---------------------------------------------------------------------------
export async function storeConfig(tenant: StoreTenant, draft = false) {
  requireTenantId();
  const config = draft
    ? await SiteConfig.findOne({ status: 'draft' }).select('version theme layout features seo settings').lean()
    : await SiteConfig.findOne({ status: 'published' }).sort({ version: -1 }).select('version theme layout features seo settings').lean();
  if (!config) throw notFound('Published site');
  const branches = await Branch.find({}).select(PUBLIC_BRANCH_FIELDS).sort({ name: 1 }).lean();
  return {
    store: {
      name: tenant.name, slug: tenant.slug, currency: tenant.currency ?? 'PKR', timezone: tenant.timezone ?? 'Asia/Karachi',
      acceptingOrders: tenant.acceptingOrders !== false,
    },
    config,
    branches: branches.map((b) => ({ ...b, openNow: isBranchOpenNow(b, tenant.timezone ?? undefined) })),
    preview: draft,
  };
}

export async function storeMenu(branchId?: string) {
  requireTenantId();
  const bid = branchId && isValidObjectId(branchId) ? new Types.ObjectId(branchId) : undefined;
  const [categories, products, groups] = await Promise.all([
    Category.find({ visible: true }).sort({ sort: 1, name: 1 }).select('name slug image sort branchIds').lean(),
    Product.find({ active: true }).sort({ sort: 1, name: 1 })
      .select('name slug description categoryId images basePrice variants modifierGroupIds tags branchOverrides stock').lean(),
    ModifierGroup.find({}).lean(),
  ]);
  const visibleCats = categories.filter((c) => !bid || !c.branchIds?.length || c.branchIds.some((x) => x.equals(bid)));
  const groupMap = new Map(groups.map((g) => [String(g._id), g]));
  const items = products.map((p) => {
    const ov = bid ? p.branchOverrides?.find((o) => o.branchId.equals(bid)) : undefined;
    const soldOut = typeof p.stock === 'number' && p.stock <= 0;
    return {
      _id: p._id, name: p.name, slug: p.slug, description: p.description, categoryId: p.categoryId, images: p.images,
      price: ov?.price ?? p.basePrice, variants: p.variants, tags: p.tags,
      available: ov?.available !== false && !soldOut, soldOut,
      modifierGroups: (p.modifierGroupIds ?? []).map((id) => groupMap.get(String(id))).filter(Boolean)
        .map((g) => ({ _id: g!._id, name: g!.name, min: g!.min, max: g!.max, options: g!.options.filter((o) => o.available !== false) })),
    };
  });
  return { categories: visibleCats.map(({ branchIds: _b, ...c }) => c), items };
}

// ---------------------------------------------------------------------------
// Quote (server-side pricing — client prices are never trusted)
// ---------------------------------------------------------------------------
const objectId = z.string().refine(isValidObjectId, 'invalid id');

export const QuoteInput = z
  .object({
    branchId: objectId.optional(),
    type: z.enum(['delivery', 'pickup']),
    items: z
      .array(
        z.object({
          productId: objectId,
          quantity: z.number().int().min(1).max(50),
          variantId: objectId.optional(),
          modifiers: z.array(z.object({ groupId: objectId, optionIds: z.array(objectId).max(20) }).strict()).max(20).optional(),
        }).strict(),
      )
      .min(1, 'Your cart is empty')
      .max(50),
    location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict().optional(),
  })
  .strict();

export type QuoteInputT = z.infer<typeof QuoteInput>;

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function publishedFlags(): Promise<{ features: Flags; settings: Record<string, any> }> {
  const c = await SiteConfig.findOne({ status: 'published' }).sort({ version: -1 }).select('features settings').lean();
  if (!c) throw notFound('Published site');
  return { features: (c.features ?? {}) as Flags, settings: (c.settings ?? {}) as Record<string, any> };
}

export async function quote(tenant: StoreTenant, raw: unknown) {
  requireTenantId();
  const input = QuoteInput.parse(raw);
  const { features, settings } = await publishedFlags();
  if (tenant.acceptingOrders === false) throw new AppError(409, 'STORE_CLOSED', 'This store is not taking orders right now');
  if (!features[input.type]?.enabled) throw badRequest(`${input.type === 'delivery' ? 'Delivery' : 'Pickup'} is not available`);

  const branch = input.branchId
    ? await Branch.findOne({ _id: input.branchId }).lean()
    : await Branch.findOne({}).sort({ createdAt: 1 }).lean();
  if (!branch) throw badRequest('Please choose a branch');
  if (!isBranchOpenNow(branch, tenant.timezone ?? undefined)) {
    throw new AppError(409, 'STORE_CLOSED', `${branch.name} is closed right now`);
  }

  const productIds = [...new Set(input.items.map((i) => i.productId))].map((id) => new Types.ObjectId(id));
  const products = await Product.find({ _id: { $in: productIds }, active: true }).lean();
  const pmap = new Map(products.map((p) => [String(p._id), p]));
  const groupIds = [...new Set(products.flatMap((p) => (p.modifierGroupIds ?? []).map(String)))];
  const groups = await ModifierGroup.find({ _id: { $in: groupIds.map((g) => new Types.ObjectId(g)) } }).lean();
  const gmap = new Map(groups.map((g) => [String(g._id), g]));
  const modifiersOn = Boolean(features.modifiers?.enabled);

  const lines = input.items.map((item) => {
    const p = pmap.get(item.productId);
    if (!p) throw badRequest('An item in your cart is no longer available');
    const ov = p.branchOverrides?.find((o) => o.branchId.equals(branch._id));
    if (ov?.available === false) throw badRequest(`${p.name} is not available at ${branch.name}`);
    if (typeof p.stock === 'number' && p.stock < item.quantity) throw badRequest(`${p.name} is sold out`);

    let unit = ov?.price ?? p.basePrice;
    let variantName: string | undefined;
    if (item.variantId) {
      const v = p.variants?.find((x) => String(x._id) === item.variantId);
      if (!v) throw badRequest(`Choose a valid option for ${p.name}`);
      unit = v.price;
      variantName = v.name;
    }

    const chosen = new Map((item.modifiers ?? []).map((m) => [m.groupId, m.optionIds]));
    const mods: { group: string; name: string; price: number }[] = [];
    for (const gid of (p.modifierGroupIds ?? []).map(String)) {
      const g = gmap.get(gid);
      if (!g) continue;
      const picked = modifiersOn ? chosen.get(gid) ?? [] : [];
      if (modifiersOn && (picked.length < g.min || picked.length > g.max)) {
        throw badRequest(`${p.name}: "${g.name}" needs ${g.min === g.max ? g.min : `${g.min}-${g.max}`} choice(s)`);
      }
      for (const oid of picked) {
        const o = g.options.find((x) => String(x._id) === oid && x.available !== false);
        if (!o) throw badRequest(`${p.name}: an option is no longer available`);
        mods.push({ group: g.name, name: o.name, price: o.price });
        unit += o.price;
      }
      chosen.delete(gid);
    }
    if (chosen.size) throw badRequest(`${p.name}: invalid options`);

    return {
      productId: p._id, name: p.name, variant: variantName, unitPrice: unit, quantity: item.quantity,
      modifiers: mods, lineTotal: unit * item.quantity,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  let deliveryFee = 0;
  if (input.type === 'delivery') {
    if (branch.minOrder && subtotal < branch.minOrder) {
      throw badRequest(`Minimum order for delivery is ${branch.minOrder}`, { code: 'MIN_ORDER', minOrder: branch.minOrder });
    }
    if (branch.deliveryRadiusKm && branch.geo?.coordinates?.length === 2 && input.location) {
      const d = haversineKm(branch.geo.coordinates as [number, number], [input.location.lng, input.location.lat]);
      if (d > branch.deliveryRadiusKm) throw badRequest(`Sorry, ${branch.name} doesn't deliver to your location yet`);
    }
    const freeAbove = Number(settings.freeDeliveryAbove ?? 0);
    deliveryFee = freeAbove > 0 && subtotal >= freeAbove ? 0 : branch.deliveryFee ?? 0;
  }
  const taxPercent = Math.min(Math.max(Number(settings.taxPercent ?? 0), 0), 50);
  const tax = Math.round((subtotal * taxPercent) / 100);
  const total = subtotal + deliveryFee + tax;

  return {
    branch: { _id: branch._id, name: branch.name, prepTimeMins: branch.prepTimeMins },
    type: input.type,
    lines,
    totals: { subtotal, deliveryFee, discount: 0, tax, total },
  };
}

// ---------------------------------------------------------------------------
// Place order (COD in v1)
// ---------------------------------------------------------------------------
export const PlaceOrderInput = QuoteInput.extend({
  customer: z
    .object({
      name: z.string().trim().min(1, 'Please enter your name').max(120),
      phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'Please enter a valid phone number'),
      email: z.string().trim().toLowerCase().email().max(254).optional(),
      address: z.string().trim().max(300).optional(),
    })
    .strict(),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(['cod', 'online']).default('cod'),
}).strict();

export async function placeOrder(tenant: StoreTenant, raw: unknown, idempotencyKey?: string) {
  requireTenantId();
  const input = PlaceOrderInput.parse(raw);
  const key = idempotencyKey && /^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey) ? idempotencyKey : undefined;
  if (key) {
    const existing = await Order.findOne({ idempotencyKey: key }).select('+trackingCode orderNo').lean();
    if (existing) return { orderId: String(existing._id), orderNo: existing.orderNo, trackingCode: existing.trackingCode };
  }

  const { features } = await publishedFlags();
  if (input.paymentMethod === 'online') throw badRequest('Online payment is coming soon, please choose Cash on Delivery');
  if (!features.cod?.enabled) throw badRequest('Cash on Delivery is not available');
  if (!features.guestCheckout?.enabled) throw badRequest('Please log in to order');
  if (input.type === 'delivery' && !input.customer.address) throw badRequest('Please enter your delivery address');

  const q = await quote(tenant, {
    branchId: input.branchId, type: input.type, items: input.items, location: input.location,
  });

  // Customers are per tenant (plan §2): same phone at two stores = two customers.
  const customer = await Customer.findOneAndUpdate(
    { phone: input.customer.phone },
    {
      $set: { name: input.customer.name, ...(input.customer.email ? { email: input.customer.email } : {}) },
      ...(input.customer.address ? { $addToSet: { addresses: { line1: input.customer.address } } } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(async (err: any) => {
    if (err?.code === 11000) return Customer.findOne({ phone: input.customer.phone });
    throw err;
  });

  // Reserve tracked stock atomically; roll back on failure.
  const reserved: { id: Types.ObjectId; qty: number }[] = [];
  try {
    for (const line of q.lines) {
      const r = await Product.updateOne(
        { _id: line.productId, stock: { $gte: line.quantity } },
        { $inc: { stock: -line.quantity } },
      );
      if (r.matchedCount === 1) reserved.push({ id: line.productId, qty: line.quantity });
      else if (await Product.exists({ _id: line.productId, stock: { $type: 'number' } })) {
        throw badRequest(`${line.name} just sold out`);
      }
    }

    const trackingCode = randomBytes(9).toString('base64url');
    const orderNo = await nextSequence('order');
    const order = await Order.create({
      orderNo,
      branchId: q.branch._id,
      customerId: customer?._id,
      customer: { name: input.customer.name, phone: input.customer.phone, address: input.customer.address },
      items: q.lines,
      totals: q.totals,
      type: input.type,
      status: 'pending',
      statusHistory: [{ status: 'pending', at: new Date() }],
      payment: { method: 'cod', status: 'pending' },
      idempotencyKey: key,
      notes: input.notes,
      trackingCode,
    });
    bus.emitEvent('order.created', {
      tenantId: String(requireTenantId()), orderId: String(order._id), orderNo, branchId: String(q.branch._id),
    });
    return { orderId: String(order._id), orderNo, trackingCode, totals: q.totals };
  } catch (err: any) {
    for (const r of reserved) await Product.updateOne({ _id: r.id }, { $inc: { stock: r.qty } });
    if (err?.code === 11000 && key) {
      const existing = await Order.findOne({ idempotencyKey: key }).select('+trackingCode orderNo').lean();
      if (existing) return { orderId: String(existing._id), orderNo: existing.orderNo, trackingCode: existing.trackingCode };
    }
    throw err;
  }
}

export async function trackOrder(orderId: string, code: string) {
  requireTenantId();
  if (!isValidObjectId(orderId) || typeof code !== 'string' || code.length > 64) throw notFound('Order');
  const order = await Order.findOne({ _id: orderId })
    .select('+trackingCode orderNo status statusHistory type items totals createdAt branchId payment.method')
    .lean();
  const a = Buffer.from(order?.trackingCode ?? '');
  const b = Buffer.from(code);
  if (!order || a.length !== b.length || !timingSafeEqual(a, b)) throw notFound('Order');
  const branch = order.branchId ? await Branch.findOne({ _id: order.branchId }).select('name phone prepTimeMins').lean() : null;
  const { trackingCode: _t, ...safe } = order;
  return {
    ...safe,
    statusHistory: (order.statusHistory ?? []).map((h) => ({ status: h.status, at: h.at })),
    branch,
  };
}
