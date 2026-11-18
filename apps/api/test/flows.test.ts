import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection';
import { createApp } from '../src/app';
import { runAsPlatform, runWithTenant } from '../src/db/tenantContext';
import { ALL_MODELS, PlatformUser, Product, Tenant, seedPlans } from '../src/models';
import { hashPassword } from '../src/services/password';
import { generateTotpSecret, totpAt, verifyTotp } from '../src/services/totp';
import { isBranchOpenNow } from '../src/services/store';

let mongo: MongoMemoryReplSet | undefined;
const app = createApp();
const TEST_DB = 'website_builder_flows_test';
const HOST = 'flow-pizza.localhost';

beforeAll(async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = mongo.getUri();
  }
  await connectToDatabase({ uri, dbName: TEST_DB, autoIndex: false });
  await mongoose.connection.db!.dropDatabase();
  for (const m of ALL_MODELS) await m.syncIndexes();
  await runAsPlatform('test', () => seedPlans());
});

afterAll(async () => {
  await mongoose.connection.db?.dropDatabase();
  await disconnectFromDatabase();
  await mongo?.stop();
});

let access = '';
let refresh = '';
const auth = () => ({ Authorization: `Bearer ${access}` });

describe('signup → build → publish → order → fulfil', () => {
  it('signs up with a template and sample menu', async () => {
    await request(app).get('/v1/auth/slug-available?slug=flow-pizza').expect(200, { slug: 'flow-pizza', available: true });
    await request(app).get('/v1/auth/slug-available?slug=admin').expect(200, { slug: 'admin', available: false });
    await request(app)
      .post('/v1/auth/signup')
      .send({ name: 'Flow Pizza', slug: 'flow-pizza', templateKey: 'bold-fast-food', owner: { name: 'Owner', email: 'owner@flow.test' } })
      .expect(400); // password required
    const res = await request(app)
      .post('/v1/auth/signup')
      .send({
        name: 'Flow Pizza', slug: 'flow-pizza', businessType: 'restaurant', templateKey: 'bold-fast-food',
        owner: { name: 'Owner', email: 'owner@flow.test', password: 'correct-horse-battery' },
      })
      .expect(201);
    access = res.body.accessToken;
    refresh = res.body.refreshToken;
    await request(app).get('/v1/auth/slug-available?slug=flow-pizza').expect(200, { slug: 'flow-pizza', available: false });
    const me = await request(app).get('/v1/admin/me').set(auth()).expect(200);
    expect(me.body.tenant.status).toBe('draft');
    expect(me.body.role.name).toBe('Owner');
    const products = await request(app).get('/v1/admin/products').set(auth()).expect(200);
    expect(products.body.items.length).toBe(10);
    const draft = await request(app).get('/v1/admin/site-config/draft').set(auth()).expect(200);
    expect(draft.body.theme.colors.primary).toBe('#E31837');
    expect(draft.body.features.delivery.enabled).toBe(true);
    // The builder saves the whole draft back; a fresh template draft must round-trip.
    const { theme, layout, seo, settings } = draft.body;
    await request(app).patch('/v1/admin/site-config/draft').set(auth()).send({ theme, layout, seo, settings }).expect(200);
  });

  it('logs in by store + email, rotates refresh tokens, detects reuse', async () => {
    await request(app).post('/v1/auth/login').send({ store: 'flow-pizza', email: 'owner@flow.test', password: 'nope-nope-nope' }).expect(401);
    await request(app).post('/v1/auth/login').send({ store: 'other', email: 'owner@flow.test', password: 'correct-horse-battery' }).expect(401);
    const login = await request(app).post('/v1/auth/login').send({ store: 'flow-pizza', email: 'owner@flow.test', password: 'correct-horse-battery' }).expect(200);
    const r1 = await request(app).post('/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(login.body.refreshToken);
    // Re-using the old token revokes the whole family, including the new one.
    await request(app).post('/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);
    await request(app).post('/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
    // The signup session is a different family and still works.
    const r2 = await request(app).post('/v1/auth/refresh').send({ refreshToken: refresh }).expect(200);
    access = r2.body.accessToken;
    refresh = r2.body.refreshToken;
  });

  it('toggles features with dependency and plan rules', async () => {
    await request(app).post('/v1/admin/features/onlinePayment/toggle').set(auth()).send({ enabled: true }).expect(400); // coming soon
    await request(app).post('/v1/admin/features/cod/toggle').set(auth()).send({ enabled: false }).expect(400); // last payment method
    await request(app).post('/v1/admin/features/delivery/toggle').set(auth()).send({ enabled: false }).expect(200);
    await request(app).post('/v1/admin/features/pickup/toggle').set(auth()).send({ enabled: false }).expect(400); // need one
    await request(app).post('/v1/admin/features/delivery/toggle').set(auth()).send({ enabled: true }).expect(200);
    const list = await request(app).get('/v1/admin/features').set(auth()).expect(200);
    expect(list.body.find((f: any) => f.key === 'multiBranch').locked).toBe(false); // trial = Pro
    await request(app).patch('/v1/admin/site-config/draft').set(auth()).send({ features: { kds: { enabled: true } } }).expect(400);
  });

  it('blocks publishing until ready, then publishes and serves the storefront', async () => {
    const r = await request(app).get('/v1/admin/site-config/readiness').set(auth()).expect(200);
    expect(r.body.checks.find((c: any) => c.key === 'branch').ok).toBe(false);
    await request(app).post('/v1/admin/site-config/publish').set(auth()).send({}).expect(400);
    await request(app).get('/v1/store/config').set('X-Store-Host', HOST).expect(404); // draft store hidden

    // Preview token unlocks the draft for this tenant only.
    const pt = await request(app).get('/v1/admin/site-config/preview-token').set(auth()).expect(200);
    const prev = await request(app).get('/v1/store/config').set('X-Store-Host', HOST).set('X-Preview-Token', pt.body.token).expect(200);
    expect(prev.body.preview).toBe(true);

    await request(app)
      .post('/v1/admin/branches')
      .set(auth())
      .send({ name: 'Gulberg', deliveryFee: 150, minOrder: 800, geo: { type: 'Point', coordinates: [74.34, 31.52] }, deliveryRadiusKm: 5 })
      .expect(201);
    await request(app).patch('/v1/admin/site-config/draft').set(auth()).send({ settings: { taxPercent: 10 } }).expect(200);
    const pub = await request(app).post('/v1/admin/site-config/publish').set(auth()).send({}).expect(200);
    expect(pub.body.version).toBe(1);
    const cfg = await request(app).get('/v1/store/config').set('X-Store-Host', HOST).expect(200);
    expect(cfg.body.store.name).toBe('Flow Pizza');
    expect(cfg.body.branches).toHaveLength(1);
    expect(cfg.body.branches[0].openNow).toBe(true);
  });

  let orderId = '';
  let trackingCode = '';

  it('prices the cart on the server with add-ons, fees and tax', async () => {
    const menu = await request(app).get('/v1/store/menu').set('X-Store-Host', HOST).expect(200);
    const pizza = menu.body.items.find((i: any) => i.slug === 'chicken-tikka-pizza');
    const size = pizza.modifierGroups.find((g: any) => g.name === 'Choose size');
    const crust = pizza.modifierGroups.find((g: any) => g.name === 'Choose crust');
    const large = size.options.find((o: any) => o.name === 'Large');
    const stuffed = crust.options.find((o: any) => o.name === 'Stuffed crust');
    const branchId = (await request(app).get('/v1/store/config').set('X-Store-Host', HOST)).body.branches[0]._id;

    // Missing a required choice.
    await request(app)
      .post('/v1/store/cart/quote')
      .set('X-Store-Host', HOST)
      .send({ type: 'delivery', branchId, items: [{ productId: pizza._id, quantity: 1, modifiers: [{ groupId: size._id, optionIds: [large._id] }] }] })
      .expect(400);

    const items = [{
      productId: pizza._id, quantity: 2,
      modifiers: [{ groupId: size._id, optionIds: [large._id] }, { groupId: crust._id, optionIds: [stuffed._id] }],
    }];
    const q = await request(app).post('/v1/store/cart/quote').set('X-Store-Host', HOST).send({ type: 'delivery', branchId, items }).expect(200);
    const unit = 1099 + 800 + 250;
    expect(q.body.lines[0].unitPrice).toBe(unit);
    expect(q.body.totals).toEqual({ subtotal: unit * 2, deliveryFee: 150, discount: 0, tax: Math.round(unit * 2 * 0.1), total: unit * 2 + 150 + Math.round(unit * 2 * 0.1) });

    // Outside the 5 km radius.
    await request(app)
      .post('/v1/store/cart/quote')
      .set('X-Store-Host', HOST)
      .send({ type: 'delivery', branchId, items, location: { lat: 33.68, lng: 73.04 } })
      .expect(400);

    // Below minimum order for delivery.
    const drink = menu.body.items.find((i: any) => i.slug === 'soft-drink-500ml');
    await request(app).post('/v1/store/cart/quote').set('X-Store-Host', HOST).send({ type: 'delivery', branchId, items: [{ productId: drink._id, quantity: 1 }] }).expect(400);

    // Client-supplied prices are ignored (strict schema rejects them).
    await request(app)
      .post('/v1/store/cart/quote')
      .set('X-Store-Host', HOST)
      .send({ type: 'pickup', branchId, items: [{ productId: drink._id, quantity: 1, price: 1 }] })
      .expect(400);

    // Place the order (idempotent).
    const body = {
      type: 'delivery', branchId, items,
      customer: { name: 'Ali', phone: '+923001112233', address: 'House 1, Street 2, Gulberg' },
      notes: 'Ring the bell', paymentMethod: 'cod',
    };
    const o1 = await request(app).post('/v1/store/orders').set('X-Store-Host', HOST).set('Idempotency-Key', 'order-key-12345').send(body).expect(201);
    const o2 = await request(app).post('/v1/store/orders').set('X-Store-Host', HOST).set('Idempotency-Key', 'order-key-12345').send(body).expect(201);
    expect(o2.body.orderId).toBe(o1.body.orderId);
    expect(o1.body.orderNo).toBe(1);
    orderId = o1.body.orderId;
    trackingCode = o1.body.trackingCode;
  });

  it('tracks only with the right code', async () => {
    await request(app).get(`/v1/store/orders/${orderId}/track?code=wrong`).set('X-Store-Host', HOST).expect(404);
    const t = await request(app).get(`/v1/store/orders/${orderId}/track?code=${trackingCode}`).set('X-Store-Host', HOST).expect(200);
    expect(t.body.status).toBe('pending');
    expect(t.body.trackingCode).toBeUndefined();
    expect(t.body.customer).toBeUndefined();
  });

  it('moves the order through the board and updates tracking', async () => {
    const b = await request(app).get('/v1/admin/orders/board').set(auth()).expect(200);
    expect(b.body).toHaveLength(1);
    await request(app).patch(`/v1/admin/orders/${orderId}/status`).set(auth()).send({ status: 'cancelled' }).expect(400); // needs reason
    for (const status of ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']) {
      await request(app).patch(`/v1/admin/orders/${orderId}/status`).set(auth()).send({ status }).expect(200);
    }
    const t = await request(app).get(`/v1/store/orders/${orderId}/track?code=${trackingCode}`).set('X-Store-Host', HOST).expect(200);
    expect(t.body.status).toBe('delivered');
    expect(t.body.statusHistory.map((h: any) => h.status)).toEqual(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']);
    const dash = await request(app).get('/v1/admin/dashboard').set(auth()).expect(200);
    expect(dash.body.today.orders).toBe(1);
    expect(dash.body.topItems[0].name).toBe('Chicken Tikka Pizza');
    const csv = await request(app).get('/v1/admin/orders/export.csv').set(auth()).expect(200);
    expect(csv.text.split('\n')).toHaveLength(2);
  });

  it('closes the store with the switch and enforces stock', async () => {
    await request(app).post('/v1/admin/store/accepting-orders').set(auth()).send({ accepting: false }).expect(200);
    const menu = await request(app).get('/v1/store/menu').set('X-Store-Host', HOST).expect(200);
    const fries = menu.body.items.find((i: any) => i.slug === 'loaded-fries');
    await request(app).post('/v1/store/cart/quote').set('X-Store-Host', HOST).send({ type: 'pickup', items: [{ productId: fries._id, quantity: 1 }] }).expect(409);
    await request(app).post('/v1/admin/store/accepting-orders').set(auth()).send({ accepting: true }).expect(200);

    await request(app).patch(`/v1/admin/products/${fries._id}`).set(auth()).send({ stock: 1 }).expect(200);
    const base = { type: 'pickup', customer: { name: 'Sara', phone: '+923004445566' } };
    await request(app).post('/v1/store/orders').set('X-Store-Host', HOST).send({ ...base, items: [{ productId: fries._id, quantity: 2 }] }).expect(400);
    await request(app).post('/v1/store/orders').set('X-Store-Host', HOST).send({ ...base, items: [{ productId: fries._id, quantity: 1 }] }).expect(201);
    const after = await request(app).get(`/v1/admin/products/${fries._id}`).set(auth()).expect(200);
    expect(after.body.stock).toBe(0);
  });

  it('enforces plan limits on create', async () => {
    const me = await request(app).get('/v1/admin/me').set(auth()).expect(200);
    await runAsPlatform('test', () => Tenant.updateOne({ _id: me.body.tenant._id }, { planId: 'starter' })); // 1 branch
    const res = await request(app).post('/v1/admin/branches').set(auth()).send({ name: 'Second' }).expect(402);
    expect(res.body.code).toBe('PLAN_LIMIT');
    await request(app).post('/v1/admin/features/multiBranch/toggle').set(auth()).send({ enabled: true }).expect(402);
    await runAsPlatform('test', () => Tenant.updateOne({ _id: me.body.tenant._id }, { planId: 'trial' }));
  });

  it('manages staff with roles and protects the owner', async () => {
    const list = await request(app).get('/v1/admin/staff').set(auth()).expect(200);
    const staffRole = list.body.roles.find((r: any) => r.name === 'Staff');
    const ownerRole = list.body.roles.find((r: any) => r.name === 'Owner');
    await request(app).post('/v1/admin/staff').set(auth()).send({ name: 'X', email: 'x@flow.test', roleId: ownerRole._id, password: 'password-123' }).expect(403);
    const s = await request(app).post('/v1/admin/staff').set(auth()).send({ name: 'Kitchen', email: 'kitchen@flow.test', roleId: staffRole._id, password: 'password-123' }).expect(201);
    expect(s.body.passwordHash).toBeUndefined();
    await request(app).delete(`/v1/admin/staff/${list.body.ownerId}`).set(auth()).expect(403);
    const kl = await request(app).post('/v1/auth/login').send({ store: 'flow-pizza', email: 'kitchen@flow.test', password: 'password-123' }).expect(200);
    await request(app).get('/v1/admin/orders/board').set('Authorization', `Bearer ${kl.body.accessToken}`).expect(200);
    await request(app).patch('/v1/admin/site-config/draft').set('Authorization', `Bearer ${kl.body.accessToken}`).send({}).expect(403);
    await request(app).delete(`/v1/admin/staff/${s.body._id}`).set(auth()).expect(200);
    await request(app).post('/v1/auth/refresh').send({ refreshToken: kl.body.refreshToken }).expect(401);
  });
});

describe('super admin', () => {
  const secret = generateTotpSecret();
  let token = '';

  it('requires password + TOTP', async () => {
    await runAsPlatform('test', async () =>
      PlatformUser.create({ email: 'ops@quickstore.test', name: 'Ops', role: 'owner', passwordHash: await hashPassword('ops-password-123'), totpSecret: secret }),
    );
    await request(app).post('/v1/platform/auth/login').send({ email: 'ops@quickstore.test', password: 'ops-password-123', code: '000000' }).expect(401);
    const res = await request(app).post('/v1/platform/auth/login').send({ email: 'ops@quickstore.test', password: 'ops-password-123', code: totpAt(secret) }).expect(200);
    token = res.body.accessToken;
  });

  it('platform tokens and tenant tokens are not interchangeable', async () => {
    await request(app).get('/v1/admin/me').set('Authorization', `Bearer ${token}`).expect(401);
    await request(app).get('/v1/platform/overview').set('Authorization', `Bearer ${access}`).expect(401);
  });

  it('lists, suspends and reactivates tenants with an audit trail', async () => {
    const ov = await request(app).get('/v1/platform/overview').set('Authorization', `Bearer ${token}`).expect(200);
    expect(ov.body.tenantsByStatus.active).toBe(1);
    const list = await request(app).get('/v1/platform/tenants?q=flow').set('Authorization', `Bearer ${token}`).expect(200);
    const id = list.body.items[0]._id;
    await request(app).post(`/v1/platform/tenants/${id}/suspend`).set('Authorization', `Bearer ${token}`).send({}).expect(400);
    await request(app).post(`/v1/platform/tenants/${id}/suspend`).set('Authorization', `Bearer ${token}`).send({ reason: 'Chargeback review' }).expect(200);
    await request(app).get('/v1/store/config').set('X-Store-Host', HOST).expect(404);
    await request(app).get('/v1/admin/me').set(auth()).expect(403);
    await request(app).post('/v1/auth/refresh').send({ refreshToken: refresh }).expect(401); // sessions revoked
    await request(app).post(`/v1/platform/tenants/${id}/reactivate`).set('Authorization', `Bearer ${token}`).send({ reason: 'Resolved' }).expect(200);
    await request(app).get('/v1/store/config').set('X-Store-Host', HOST).expect(200);
    await request(app).post(`/v1/platform/tenants/${id}/plan`).set('Authorization', `Bearer ${token}`).send({ planId: 'pro' }).expect(200);
    const detail = await request(app).get(`/v1/platform/tenants/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(detail.body.tenant.planId).toBe('pro');
    expect(detail.body.usage.products).toBe(10);
    expect(detail.body.audit.map((a: any) => a.action)).toEqual(expect.arrayContaining(['tenant.suspend', 'tenant.reactivate', 'tenant.plan_change']));
  });
});

describe('units', () => {
  it('TOTP matches RFC 6238 test vector', () => {
    // RFC 6238 SHA-1 secret "12345678901234567890" at T=59s → 94287082 (8 digits) → last 6: 287082
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totpAt(secret, 59_000)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59_000)).toBe(true);
    expect(verifyTotp(secret, '287083', 59_000)).toBe(false);
  });

  it('opening hours handle closed days and past-midnight closing', () => {
    expect(isBranchOpenNow({ isOpen: false })).toBe(false);
    expect(isBranchOpenNow({ hours: {} })).toBe(true);
    const all = (w: object) => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, w]));
    expect(isBranchOpenNow({ hours: all({ open: '00:00', close: '23:59' }) }, 'UTC')).toBe(new Date().getUTCHours() * 60 + new Date().getUTCMinutes() < 1439);
    expect(isBranchOpenNow({ hours: all({ open: '00:00', close: '23:59', closed: true }) }, 'UTC')).toBe(false);
    expect(isBranchOpenNow({ hours: all({ open: '00:01', close: '00:00' }) }, 'UTC')).toBe(true); // wraps midnight
  });

  it('stock is never negative after concurrent orders', async () => {
    const t = await runAsPlatform('test', () => Tenant.findOne({ slug: 'flow-pizza' }).lean());
    await runWithTenant({ tenantId: t!._id as Types.ObjectId }, async () => {
      const p = await Product.findOne({ slug: 'garlic-bread' });
      p!.stock = 3;
      await p!.save();
    });
    const menu = await request(app).get('/v1/store/menu').set('X-Store-Host', HOST).expect(200);
    const gb = menu.body.items.find((i: any) => i.slug === 'garlic-bread');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(app).post('/v1/store/orders').set('X-Store-Host', HOST)
          .send({ type: 'pickup', customer: { name: 'C', phone: `+92300000000${i}` }, items: [{ productId: gb._id, quantity: 1 }] }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const left = await runWithTenant({ tenantId: t!._id as Types.ObjectId }, () => Product.findOne({ slug: 'garlic-bread' }).lean());
    expect(left!.stock).toBe(0);
  });
});
