import { Types } from 'mongoose';
import { Domain } from '../models';
import { runAsPlatform } from '../db/tenantContext';
import { bus } from '../services/events';

/**
 * Purges the storefront cache for a tenant's hostnames after publish / suspend / reactivate
 * (plan §11.2 step 4). Configure STOREFRONT_REVALIDATE_URL and REVALIDATE_SECRET; without them
 * the storefront simply refreshes on its short cache TTL.
 */
async function purge(tenantId: string) {
  const url = process.env.STOREFRONT_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) return;
  const hosts = await runAsPlatform('cache purge: hostnames', () =>
    Domain.find({ tenantId: new Types.ObjectId(tenantId) }).select('hostname').lean(),
  );
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Revalidate-Secret': secret },
      body: JSON.stringify({ hosts: hosts.map((h) => h.hostname) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) console.error(`[cache-purge] storefront answered ${r.status}`);
  } catch (err) {
    console.error('[cache-purge] failed:', (err as Error).message);
  }
}

export function startCachePurgeWorker() {
  bus.onEvent('site.published', (e) => void purge(e.tenantId));
  bus.onEvent('tenant.status_changed', (e) => void purge(e.tenantId));
}
