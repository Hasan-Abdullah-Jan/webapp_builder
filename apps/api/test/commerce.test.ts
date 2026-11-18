import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection';
import { createApp } from '../src/app';
import { runAsPlatform } from '../src/db/tenantContext';
import { ALL_MODELS, seedPlans } from '../src/models';
import { parseCsv } from '../src/services/productCsv';

let mongo: MongoMemoryReplSet | undefined;
const app = createApp();
const TEST_DB = 'website_builder_commerce_test';
const HOST = 'urban-threads.localhost';
let A = '';
let B = '';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

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
  const a = await request(app).post('/v1/auth/signup').send({
    name: 'Urban Threads', slug: 'urban-threads', businessType: 'fashion',
    owner: { name: 'Ayesha', email: 'ayesha@threads.test', password: 'password-12345' },
  }).expect(201);
  A = a.body.accessToken;
  const b = await request(app).post('/v1/auth/signup').send({
    name: 'Other Shop', slug: 'other-shop', businessType: 'grocery',
    owner: { name: 'Bob', email: 'bob@other.test', password: 'password-12345' },
  }).expect(201);
  B = b.body.accessToken;
});

afterAll(async () => {
  await mongoose.connection.db?.dropDatabase();
  await disconnectFromDatabase();
  await mongo?.stop();
});

const as = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('business types', () => {
  it('uses retail wording, a retail template and sample products with variants', async () => {
    const me = await request(app).get('/v1/admin/me').set(as(A)).expect(200);
    expect(me.body.vocab.catalog).toBe('Shop');
    expect(me.body.vocab.items).toBe('Products');
    expect(me.body.tenant.templateKey).toBe('modern-retail');
    const products = await request(app).get('/v1/admin/products').set(as(A)).expect(200);
    const shirt = products.body.items.find((p: any) => p.slug === 'linen-summer-shirt');
    expect(shirt.variants.map((v: any) => v.name)).toEqual(['S', 'M', 'L', 'XL']);
    const tpl = await request(app).get('/v1/public/templates?businessType=fashion').expect(200);
    expect(tpl.body.map((t: any) => t.key)).toEqual(['modern-retail']);
    const grocery = await request(app).get('/v1/public/templates?businessType=grocery').expect(200);
    expect(grocery.body[0].key).toBe('fresh-market');
  });
});

describe('media uploads', () => {
  let id = '';
  it('accepts real images only and scopes them to the tenant', async () => {
    await request(app).post('/v1/admin/media').set(as(A)).set('Content-Type', 'image/png').send(Buffer.from('<svg onload=alert(1)>')).expect(400);
    const up = await request(app).post('/v1/admin/media').set(as(A)).set('Content-Type', 'image/png').set('X-Filename', 'logo.png').send(PNG).expect(201);
    expect(up.body.url).toMatch(/^\/media\/[a-f0-9]{24}$/);
    id = up.body.id;
    const img = await request(app).get(`/v1/media/${id}`).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    const listB = await request(app).get('/v1/admin/media').set(as(B)).expect(200);
    expect(listB.body).toHaveLength(0);
    await request(app).delete(`/v1/admin/media/${id}`).set(as(B)).expect(404);
    const listA = await request(app).get('/v1/admin/media').set(as(A)).expect(200);
    expect(listA.body).toHaveLength(1);
  });

  it('lets products and logos use uploaded images', async () => {
    const p = await request(app).post('/v1/admin/products').set(as(A))
      .send({ name: 'Denim Jacket', slug: 'denim-jacket', basePrice: 6990, images: [`/media/${id}`] }).expect(201);
    expect(p.body.images[0]).toBe(`/media/${id}`);
    await request(app).patch('/v1/admin/site-config/draft').set(as(A)).send({ theme: { logo: `/media/${id}` } }).expect(200);
    await request(app).post('/v1/admin/products').set(as(A)).send({ name: 'X', slug: 'x-bad', basePrice: 1, images: ['javascript:alert(1)'] }).expect(400);
  });
});

describe('CSV import / export', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]);
  });

  it('imports new and updated products, creating collections, and reports bad rows', async () => {
    const csv = [
      'name,category,price,description,tags,stock,active,slug',
      'Wool Beanie,Winter,1500,"Warm, soft",new|popular,20,yes,',
      'Linen Summer Shirt,Men,3790,Updated price,,,yes,linen-summer-shirt',
      ',Winter,100,,,,,',
      'Bad Price,Winter,abc,,,,,',
    ].join('\n');
    const res = await request(app).post('/v1/admin/products/import').set(as(A)).set('Content-Type', 'text/csv').send(csv).expect(200);
    expect(res.body.created).toBe(1);
    expect(res.body.updated).toBe(1);
    expect(res.body.errorCount).toBe(2);
    const cats = await request(app).get('/v1/admin/categories').set(as(A)).expect(200);
    expect(cats.body.items.some((c: any) => c.name === 'Winter')).toBe(true);
    const out = await request(app).get('/v1/admin/products/export.csv').set(as(A)).expect(200);
    expect(out.text).toContain('Wool Beanie,Winter,1500,"Warm, soft",new|popular,20,yes');
    expect(out.text).toContain('Linen Summer Shirt,Men,3790');
    // Tenant B's export doesn't include tenant A's products.
    const outB = await request(app).get('/v1/admin/products/export.csv').set(as(B)).expect(200);
    expect(outB.text).not.toContain('Wool Beanie');
  });
});

describe('discount codes', () => {
  it('validates, applies, limits and counts codes', async () => {
    await request(app).post('/v1/admin/coupons').set(as(A)).send({ code: 'save', type: 'percent', value: 150 }).expect(400);
    await request(app).post('/v1/admin/coupons').set(as(A)).send({ code: 'save10', type: 'percent', value: 10, maxDiscount: 500, usageLimit: 1 }).expect(201);
    await request(app).post('/v1/admin/coupons').set(as(A)).send({ code: 'SAVE10', type: 'fixed', value: 1 }).expect(409);
    await request(app).post('/v1/admin/coupons').set(as(A)).send({ code: 'FREESHIP', type: 'free_delivery', minOrder: 1000 }).expect(201);
    await request(app).post('/v1/admin/branches').set(as(A)).send({ name: 'Mall Road', deliveryFee: 300 }).expect(201);
    await request(app).post('/v1/admin/site-config/publish').set(as(A)).send({}).expect(200);

    const menu = await request(app).get('/v1/store/menu').set('X-Store-Host', HOST).expect(200);
    const shirt = menu.body.items.find((i: any) => i.slug === 'linen-summer-shirt');
    const xl = shirt.variants.find((v: any) => v.name === 'XL');
    const items = [{ productId: shirt._id, variantId: xl._id, quantity: 2 }];

    const q = await request(app).post('/v1/store/cart/quote').set('X-Store-Host', HOST).send({ type: 'delivery', items, couponCode: 'save10' }).expect(200);
    expect(q.body.lines[0].variant).toBe('XL');
    expect(q.body.totals).toMatchObject({ subtotal: 7380, deliveryFee: 300, discount: 500, total: 7180 });
    const bad = await request(app).post('/v1/store/cart/quote').set('X-Store-Host', HOST).send({ type: 'delivery', items, couponCode: 'NOPE' }).expect(200);
    expect(bad.body.couponError).toMatch(/isn't valid/);
    expect(bad.body.totals.discount).toBe(0);
    const ship = await request(app).post('/v1/store/cart/quote').set('X-Store-Host', HOST).send({ type: 'delivery', items, couponCode: 'freeship' }).expect(200);
    expect(ship.body.totals).toMatchObject({ deliveryFee: 300, discount: 300, total: 7380 });

    const order = { type: 'delivery', items, couponCode: 'SAVE10', customer: { name: 'Zara', phone: '+923001110000', address: 'Gulberg' } };
    const o = await request(app).post('/v1/store/orders').set('X-Store-Host', HOST).send(order).expect(201);
    expect(o.body.totals.discount).toBe(500);
    // Usage limit of 1 reached.
    await request(app).post('/v1/store/orders').set('X-Store-Host', HOST).send({ ...order, customer: { ...order.customer, phone: '+923001110001' } }).expect(400);
    const list = await request(app).get('/v1/admin/coupons').set(as(A)).expect(200);
    expect(list.body.items.find((c: any) => c.code === 'SAVE10').usedCount).toBe(1);
    // Tenant B can't see or use tenant A's codes.
    const listB = await request(app).get('/v1/admin/coupons').set(as(B)).expect(200);
    expect(listB.body.items).toHaveLength(0);
  });

  it('reports sales, items and coupon usage', async () => {
    const r = await request(app).get('/v1/admin/reports?days=7').set(as(A)).expect(200);
    expect(r.body.summary.orders).toBe(1);
    expect(r.body.summary.revenue).toBe(7180);
    expect(r.body.summary.discounts).toBe(500);
    expect(r.body.byItem[0].name).toBe('Linen Summer Shirt');
    expect(r.body.byCoupon[0]).toMatchObject({ code: 'SAVE10', uses: 1 });
    expect(r.body.byHour).toHaveLength(24);
    const rb = await request(app).get('/v1/admin/reports?days=7').set(as(B)).expect(200);
    expect(rb.body.summary.orders).toBe(0);
  });

  it('exposes retail wording to the storefront', async () => {
    const cfg = await request(app).get('/v1/store/config').set('X-Store-Host', HOST).expect(200);
    expect(cfg.body.store.vocab.cta).toBe('Shop now');
    expect(cfg.body.store.businessType).toBe('fashion');
  });
});
