import { Types } from 'mongoose';
import { Domain } from '../models';
import { runAsPlatform } from '../db/tenantContext';

/**
 * Purges the storefront cache for a tenant's hostnames after publish / suspend / reactivate
 * (plan §11.2 step 4). Awaited inline (not via the event bus) so it also completes on
 * serverless hosts, where work scheduled after the response may never run.
 * Configure STOREFRONT_REVALIDATE_URL and REVALIDATE_SECRET; without them the storefront
 * refreshes on its short cache TTL instead. Never throws.
 */
export async function purgeTenantCache(tenantId: string | Types.ObjectId) {
  const url = process.env.STOREFRONT_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  try {
    const hosts = await runAsPlatform('cache purge: hostnames', () =>
      Domain.find({ tenantId: new Types.ObjectId(String(tenantId)) }).select('hostname').lean(),
    );
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Revalidate-Secret': secret },
      body: JSON.stringify({ hosts: hosts.map((h) => h.hostname) }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) console.error(`[cache-purge] storefront answered ${r.status}`);
  } catch (err) {
    console.error('[cache-purge] failed:', (err as Error).message);
  }
}
