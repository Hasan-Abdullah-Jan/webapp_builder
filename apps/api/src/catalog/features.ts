/**
 * Feature catalogue (plan §7). Each module has a key, dependencies and a minimum plan.
 * `available: false` modules are listed in the admin as "Coming soon" and cannot be enabled.
 * The storefront AND the API check the same `features.<key>.enabled` flag.
 */
export interface FeatureDef {
  key: string;
  name: string;
  description: string;
  category: 'ordering' | 'payments' | 'catalog' | 'customers' | 'marketing' | 'operations';
  dependsOn: string[];
  minPlan: 'starter' | 'pro' | 'business';
  available: boolean;
  defaultFor: string[]; // business types; 'all' = every type
}

export const FEATURES: FeatureDef[] = [
  { key: 'delivery', name: 'Delivery', description: 'Customers enter an address; delivery fee and minimum order apply.', category: 'ordering', dependsOn: [], minPlan: 'starter', available: true, defaultFor: ['restaurant', 'cafe', 'bakery', 'grocery', 'pharmacy', 'fashion', 'electronics', 'other'] },
  { key: 'pickup', name: 'Pickup / Takeaway', description: 'Customers order ahead and collect from a branch.', category: 'ordering', dependsOn: [], minPlan: 'starter', available: true, defaultFor: ['all'] },
  { key: 'cod', name: 'Cash on Delivery', description: 'Pay with cash when the order arrives or at pickup.', category: 'payments', dependsOn: [], minPlan: 'starter', available: true, defaultFor: ['all'] },
  { key: 'guestCheckout', name: 'Guest checkout', description: 'Order with just a name and phone number, no account.', category: 'customers', dependsOn: [], minPlan: 'starter', available: true, defaultFor: ['all'] },
  { key: 'modifiers', name: 'Options & add-ons', description: 'Extra choices on an item: toppings, gift wrap, service extras.', category: 'catalog', dependsOn: [], minPlan: 'starter', available: true, defaultFor: ['all'] },
  { key: 'orderTracking', name: 'Live order tracking', description: 'Status timeline page for every order.', category: 'ordering', dependsOn: [], minPlan: 'starter', available: true, defaultFor: ['all'] },
  { key: 'multiBranch', name: 'Multi-branch', description: 'Branch selector with per-branch prices and availability.', category: 'operations', dependsOn: [], minPlan: 'pro', available: true, defaultFor: [] },
  { key: 'onlinePayment', name: 'Online payments', description: 'Cards and wallets through your payment gateway.', category: 'payments', dependsOn: [], minPlan: 'starter', available: false, defaultFor: [] },
  { key: 'coupons', name: 'Discount codes', description: 'Percentage, fixed-amount and free-delivery codes with limits and dates.', category: 'marketing', dependsOn: [], minPlan: 'starter', available: true, defaultFor: ['all'] },
  { key: 'customerAccounts', name: 'Customer accounts', description: 'Phone-OTP login, saved addresses, reorder.', category: 'customers', dependsOn: [], minPlan: 'starter', available: false, defaultFor: [] },
  { key: 'kds', name: 'Kitchen Display', description: 'Kitchen screen with tickets and timers.', category: 'operations', dependsOn: [], minPlan: 'pro', available: false, defaultFor: [] },
  { key: 'riders', name: 'Riders / own fleet', description: 'Rider assignment and live location.', category: 'operations', dependsOn: ['delivery'], minPlan: 'pro', available: false, defaultFor: [] },
  { key: 'reservations', name: 'Table reservations', description: 'Date, time and party-size booking.', category: 'customers', dependsOn: [], minPlan: 'pro', available: false, defaultFor: [] },
  { key: 'loyalty', name: 'Loyalty points', description: 'Earn and redeem points.', category: 'marketing', dependsOn: ['customerAccounts'], minPlan: 'pro', available: false, defaultFor: [] },
  { key: 'reviews', name: 'Reviews and ratings', description: 'Item and order reviews with moderation.', category: 'customers', dependsOn: ['customerAccounts'], minPlan: 'starter', available: false, defaultFor: [] },
  { key: 'whatsapp', name: 'WhatsApp notifications', description: 'Order updates on WhatsApp.', category: 'marketing', dependsOn: [], minPlan: 'pro', available: false, defaultFor: [] },
];

export const FEATURE_MAP = new Map(FEATURES.map((f) => [f.key, f]));
const PLAN_RANK: Record<string, number> = { starter: 1, trial: 2, pro: 2, business: 3, enterprise: 4 };

export function planAllows(planKey: string, minPlan: string) {
  return (PLAN_RANK[planKey] ?? 0) >= (PLAN_RANK[minPlan] ?? 99);
}

export function defaultFeatures(businessType: string): Record<string, { enabled: boolean }> {
  const out: Record<string, { enabled: boolean }> = {};
  for (const f of FEATURES) {
    out[f.key] = { enabled: f.available && (f.defaultFor.includes('all') || f.defaultFor.includes(businessType)) };
  }
  // Every store needs at least one way to receive and pay for orders.
  if (!out.delivery.enabled && !out.pickup.enabled) out.pickup.enabled = true;
  out.cod.enabled = true;
  return out;
}

/** All features that must turn on with `key` (transitive dependencies). */
export function dependenciesOf(key: string, seen = new Set<string>()): string[] {
  for (const d of FEATURE_MAP.get(key)?.dependsOn ?? []) {
    if (!seen.has(d)) {
      seen.add(d);
      dependenciesOf(d, seen);
    }
  }
  return [...seen];
}

/** All features that must turn off with `key` (transitive dependents). */
export function dependentsOf(key: string, seen = new Set<string>()): string[] {
  for (const f of FEATURES) {
    if (f.dependsOn.includes(key) && !seen.has(f.key)) {
      seen.add(f.key);
      dependentsOf(f.key, seen);
    }
  }
  return [...seen];
}
