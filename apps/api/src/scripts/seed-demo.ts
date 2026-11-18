import { Types } from 'mongoose';
import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { runAsPlatform, runWithTenant } from '../db/tenantContext';
import { Branch, Tenant, seedPlans } from '../models';
import { provisionTenant } from '../services/tenants';
import { publish } from '../services/siteConfig';

/**
 * Seeds a published demo restaurant for local development:
 *   http://pizza-point.localhost:3000  (storefront)
 *   admin login: store "pizza-point", demo@example.com / demo-password-123
 */
async function main() {
  await connectToDatabase({ autoIndex: true });
  await runAsPlatform('seed: plans', () => seedPlans());
  const exists = await runAsPlatform('seed: check', () => Tenant.exists({ slug: 'pizza-point' }));
  if (exists) {
    console.log('Demo store "pizza-point" already exists.');
    return disconnectFromDatabase();
  }
  const res = await provisionTenant({
    name: 'Pizza Point',
    slug: 'pizza-point',
    businessType: 'restaurant',
    templateKey: 'bold-fast-food',
    owner: { name: 'Demo Owner', email: 'demo@example.com', password: 'demo-password-123' },
  });
  await runWithTenant({ tenantId: new Types.ObjectId(res.tenantId) }, async () => {
    await Branch.create({
      name: 'Gulberg',
      address: 'Main Boulevard, Gulberg III, Lahore',
      phone: '+924235000000',
      geo: { type: 'Point', coordinates: [74.3436, 31.5204] },
      deliveryFee: 150,
      minOrder: 800,
      deliveryRadiusKm: 8,
      prepTimeMins: 30,
    });
    await publish(new Types.ObjectId(res.ownerId));
  });
  console.log('Seeded demo store "pizza-point" (published).');
  console.log('  Storefront: http://pizza-point.localhost:3000');
  console.log('  Admin:      http://localhost:3001  store=pizza-point  demo@example.com / demo-password-123');
  await disconnectFromDatabase();
}

main().catch(async (err) => {
  console.error('[seed] failed:', err.message);
  await disconnectFromDatabase().catch(() => {});
  process.exit(1);
});
