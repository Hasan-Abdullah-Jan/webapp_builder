import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connection';
import { createApp } from '../src/app';
import { signStaffToken } from '../src/http/middleware/auth';
import { provisionTenant } from '../src/services/tenants';
import { runAsPlatform, runWithTenant, TenantScopeError } from '../src/db/tenantContext';
import { ALL_MODELS, Order, Product, Role, User, Domain, Tenant } from '../src/models';

// Uses MONGODB_TEST_URI if set (e.g. a local Docker mongo); otherwise an in-memory replica set.
// Never point this at production: the test database is dropped afterwards.
let mongo: MongoMemoryReplSet | undefined;
const TEST_DB = 'website_builder_test';
const app = createApp();
let A: { tenantId: string; ownerId: string; token: string };
let B: { tenantId: string; ownerId: string; token: string };

beforeAll(async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = mongo.getUri();
  }
  await connectToDatabase({ uri, dbName: TEST_DB, autoIndex: false });
  await mongoose.connection.db!.dropDatabase();
  for (const m of ALL_MODELS) await m.syncIndexes();
  const a = await provisionTenant({ name: 'Pizza A', slug: 'pizza-a', owner: { name: 'Owner A', email: 'a@example.com' } });
  const b = await provisionTenant({ name: 'Burger B', slug: 'burger-b', owner: { name: 'Owner B', phone: '+923001234567' } });
  A = { ...a, token: signStaffToken(a.ownerId, a.tenantId) };
  B = { ...b, token: signStaffToken(b.ownerId, b.tenantId) };
});

afterAll(async () => {
  await mongoose.connection.db?.dropDatabase();
  await disconnectFromDatabase();
  await mongo?.stop();
});

const auth = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });

describe('data-layer guard (tenant plugin)', () => {
  it('refuses tenant-collection queries without tenant context', async () => {
    await expect(Product.find({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(Product.countDocuments({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(Product.aggregate([{ $match: {} }])).rejects.toBeInstanceOf(TenantScopeError);
    await expect(Product.create({ name: 'x', slug: 'x', basePrice: 1 })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(Product.deleteMany({})).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('overrides a tenantId smuggled into a filter', async () => {
    const tA = new Types.ObjectId(A.tenantId);
    const tB = new Types.ObjectId(B.tenantId);
    await runWithTenant({ tenantId: tA }, () => Product.create({ name: 'Secret', slug: 'secret', basePrice: 9 }));
    const leaked = await runWithTenant({ tenantId: tB }, () => Product.find({ tenantId: tA }).lean());
    expect(leaked).toHaveLength(0);
    const agg = await runWithTenant({ tenantId: tB }, () => Product.aggregate([{ $match: { tenantId: tA } }]));
    expect(agg).toHaveLength(0);
  });

  it('refuses to write a document stamped with another tenant', async () => {
    const tA = new Types.ObjectId(A.tenantId);
    const tB = new Types.ObjectId(B.tenantId);
    await expect(
      runWithTenant({ tenantId: tB }, () => Product.create({ tenantId: tA, name: 'x', slug: 'evil', basePrice: 1 })),
    ).rejects.toBeInstanceOf(TenantScopeError);
    await expect(
      runWithTenant({ tenantId: tB }, () => Product.insertMany([{ tenantId: tA, name: 'x', slug: 'evil2', basePrice: 1 }])),
    ).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('scopes $lookup joins to the caller tenant', async () => {
    const tA = new Types.ObjectId(A.tenantId);
    const tB = new Types.ObjectId(B.tenantId);
    const prodA = await runWithTenant({ tenantId: tA }, () => Product.create({ name: 'L', slug: 'lookup-a', basePrice: 1 }));
    // Tenant B has an order pointing at tenant A's product id (bad data / attack).
    await runWithTenant({ tenantId: tB }, () =>
      Order.create({ orderNo: 999, type: 'pickup', items: [{ productId: prodA._id, name: 'x', unitPrice: 1, quantity: 1, lineTotal: 1 }], totals: { subtotal: 1, total: 1 } }),
    );
    const rows = await runWithTenant({ tenantId: tB }, () =>
      Order.aggregate([{ $match: { orderNo: 999 } }, { $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'p' } }]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].p).toHaveLength(0);
  });

  it('allows explicit platform scope', async () => {
    const n = await runAsPlatform('test', () => Role.countDocuments({}));
    expect(n).toBe(8); // 4 default roles × 2 tenants
  });
});

describe('admin API isolation', () => {
  let productA: string;

  it('requires a valid token', async () => {
    await request(app).get('/v1/admin/products').expect(401);
    await request(app).get('/v1/admin/products').set('Authorization', 'Bearer nope').expect(401);
    const forged = require('jsonwebtoken').sign({ tid: A.tenantId, typ: 'staff' }, 'wrong-secret', { subject: A.ownerId });
    await request(app).get('/v1/admin/products').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('creates in own tenant and ignores/rejects tenantId in the body', async () => {
    await request(app)
      .post('/v1/admin/products')
      .set(auth(A))
      .send({ name: 'Margherita', slug: 'margherita', basePrice: 1200, tenantId: B.tenantId })
      .expect(400);
    const res = await request(app)
      .post('/v1/admin/products')
      .set(auth(A))
      .send({ name: 'Margherita', slug: 'margherita', basePrice: 1200 })
      .expect(201);
    expect(res.body.tenantId).toBe(A.tenantId);
    productA = res.body._id;
  });

  it("returns 404 for another tenant's ids on read/update/delete", async () => {
    await request(app).get(`/v1/admin/products/${productA}`).set(auth(B)).expect(404);
    await request(app).patch(`/v1/admin/products/${productA}`).set(auth(B)).send({ basePrice: 1 }).expect(404);
    await request(app).delete(`/v1/admin/products/${productA}`).set(auth(B)).expect(404);
    const list = await request(app).get('/v1/admin/products').set(auth(B)).expect(200);
    expect(list.body.items.map((p: any) => p._id)).not.toContain(productA);
    const own = await request(app).get(`/v1/admin/products/${productA}`).set(auth(A)).expect(200);
    expect(own.body.basePrice).toBe(1200);
  });

  it('rejects NoSQL operator injection in bodies and ids', async () => {
    await request(app).patch(`/v1/admin/products/${productA}`).set(auth(A)).send({ basePrice: { $gt: 0 } }).expect(400);
    await request(app).get('/v1/admin/products/%7B%22$ne%22:null%7D').set(auth(A)).expect(404);
    await request(app).get('/v1/admin/products?q=.*').set(auth(A)).expect(200);
  });

  it('allows the same slug in different tenants but not twice in one', async () => {
    await request(app).post('/v1/admin/products').set(auth(B)).send({ name: 'M', slug: 'margherita', basePrice: 5 }).expect(201);
    await request(app).post('/v1/admin/products').set(auth(A)).send({ name: 'M2', slug: 'margherita', basePrice: 5 }).expect(409);
  });

  it('full CRUD round-trip with pagination', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/v1/admin/categories').set(auth(A)).send({ name: `Cat ${i}`, slug: `cat-${i}` }).expect(201);
    }
    const p1 = await request(app).get('/v1/admin/categories?limit=2').set(auth(A)).expect(200);
    expect(p1.body.items).toHaveLength(2);
    const p2 = await request(app).get(`/v1/admin/categories?limit=2&cursor=${p1.body.nextCursor}`).set(auth(A)).expect(200);
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.nextCursor).toBeNull();
    const id = p2.body.items[0]._id;
    const upd = await request(app).patch(`/v1/admin/categories/${id}`).set(auth(A)).send({ name: 'Renamed' }).expect(200);
    expect(upd.body.name).toBe('Renamed');
    await request(app).delete(`/v1/admin/categories/${id}`).set(auth(A)).expect(200);
    await request(app).get(`/v1/admin/categories/${id}`).set(auth(A)).expect(404);
  });

  it('enforces role permissions', async () => {
    const tA = new Types.ObjectId(A.tenantId);
    const staff = await runWithTenant({ tenantId: tA }, async () => {
      const role = await Role.findOne({ name: 'Staff' });
      return User.create({ name: 'Kitchen', phone: '+923000000001', roleId: role!._id });
    });
    const token = signStaffToken(String(staff._id), A.tenantId);
    await request(app).get('/v1/admin/orders').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app).post('/v1/admin/products').set('Authorization', `Bearer ${token}`).send({ name: 'x', slug: 'x', basePrice: 1 }).expect(403);
  });

  it("rejects a token whose user belongs to another tenant", async () => {
    const mixed = signStaffToken(A.ownerId, B.tenantId); // user A + tenant B
    await request(app).get('/v1/admin/products').set('Authorization', `Bearer ${mixed}`).expect(401);
  });

  it('blocks suspended stores', async () => {
    const s = await provisionTenant({ name: 'Sus', slug: 'sus-store', owner: { name: 'S', email: 's@example.com' } });
    await runAsPlatform('test', () => Tenant.updateOne({ _id: s.tenantId }, { status: 'suspended' }));
    await request(app).get('/v1/admin/products').set('Authorization', `Bearer ${signStaffToken(s.ownerId, s.tenantId)}`).expect(403);
  });
});

describe('orders', () => {
  it('follows the status state machine and is tenant-scoped', async () => {
    const tA = new Types.ObjectId(A.tenantId);
    const order = await runWithTenant({ tenantId: tA }, () =>
      Order.create({ orderNo: 1, type: 'delivery', items: [{ name: 'Pizza', unitPrice: 1000, quantity: 1, lineTotal: 1000 }], totals: { subtotal: 1000, total: 1000 } }),
    );
    const id = String(order._id);
    await request(app).patch(`/v1/admin/orders/${id}/status`).set(auth(B)).send({ status: 'confirmed' }).expect(404);
    await request(app).patch(`/v1/admin/orders/${id}/status`).set(auth(A)).send({ status: 'delivered' }).expect(400);
    const ok = await request(app).patch(`/v1/admin/orders/${id}/status`).set(auth(A)).send({ status: 'confirmed' }).expect(200);
    expect(ok.body.status).toBe('confirmed');
    expect(ok.body.statusHistory).toHaveLength(1);
  });
});

describe('site config + storefront', () => {
  it('edits draft, publishes immutable versions, serves by hostname only', async () => {
    await request(app).get('/v1/store/config').set('Host', 'pizza-a.quickstore.pk').expect(404); // not published yet
    await request(app)
      .patch('/v1/admin/site-config/draft')
      .set(auth(A))
      .send({ theme: { colors: { primary: '#E31837' }, customCss: 'body{} </style><script>alert(1)</script>' } })
      .expect(400);
    await request(app).patch('/v1/admin/site-config/draft').set(auth(A)).send({ theme: { colors: { primary: '#E31837' } } }).expect(200);
    const v1 = await request(app).post('/v1/admin/site-config/publish').set(auth(A)).send({}).expect(200);
    expect(v1.body.version).toBe(1);
    await request(app).patch('/v1/admin/site-config/draft').set(auth(A)).send({ theme: { colors: { primary: '#000000' } } }).expect(200);
    await request(app).post('/v1/admin/site-config/publish').set(auth(A)).send({}).expect(200);
    const rollback = await request(app).post('/v1/admin/site-config/publish').set(auth(A)).send({ fromVersion: 1 }).expect(200);
    expect(rollback.body.version).toBe(3);
    expect(rollback.body.theme.colors.primary).toBe('#E31837');

    const store = await request(app).get('/v1/store/config').set('Host', 'pizza-a.quickstore.pk').expect(200);
    expect(store.body.version).toBe(3);
    expect(store.body.tenantId).toBeUndefined();
    // Tenant B is not published → its host 404s, and A's config is never served on B's host.
    await request(app).get('/v1/store/config').set('Host', 'burger-b.quickstore.pk').expect(404);
    await request(app).get('/v1/store/config').set('Host', 'unknown.example.com').expect(404);
  });
});

describe('indexes', () => {
  it('every tenant-collection index is prefixed by tenantId', async () => {
    const tenantModels = ALL_MODELS.filter((m) => m.schema.path('tenantId') && m !== Domain);
    for (const m of tenantModels) {
      const idx = await m.listIndexes();
      for (const i of idx) {
        if (i.name === '_id_') continue;
        expect(Object.keys(i.key)[0], `${m.modelName}.${i.name}`).toBe('tenantId');
      }
    }
    const collections = (await mongoose.connection.db!.listCollections().toArray()).map((c) => c.name).sort();
    expect(collections).toEqual(
      ['branches', 'categories', 'counters', 'customers', 'domains', 'orders', 'products', 'roles', 'siteConfigs', 'tenants', 'users'],
    );
  });
});
