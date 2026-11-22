import 'server-only';
import { headers } from 'next/headers';
import type { Menu, StoreData } from './types';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: { code?: string; message?: string; details?: unknown }) {
    super(body?.message ?? `API error ${status}`);
  }
}

/** The store's hostname, as the visitor typed it (behind a proxy, x-forwarded-host). */
export async function storeHost() {
  const h = await headers();
  // Set by middleware for /s/<slug> URLs (incoming copies are stripped there).
  const forced = h.get('x-store-host');
  if (forced) return forced.toLowerCase();
  return (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().toLowerCase();
}

/** "" for host-based stores, "/s/<slug>" for path-based ones. Prefix every internal link with it. */
export async function storeBase() {
  const h = await headers();
  const b = h.get('x-store-base') ?? '';
  return /^\/s\/[a-z0-9-]+$/.test(b) ? b : '';
}

/**
 * Server-side call to the API on behalf of the current store. The browser never talks to the
 * API directly: all data access stays on the server.
 */
export async function storeApi<T>(
  path: string,
  init: { method?: string; body?: unknown; host?: string; previewToken?: string; idempotencyKey?: string; revalidate?: number } = {},
): Promise<T> {
  const host = init.host ?? (await storeHost());
  const res = await fetch(`${API_URL}/v1/store${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Store-Host': host,
      ...(init.previewToken ? { 'X-Preview-Token': init.previewToken } : {}),
      ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    // Published config/menu are cached briefly per host; writes and previews are never cached.
    ...(init.method && init.method !== 'GET'
      ? { cache: 'no-store' as const }
      : init.previewToken || init.revalidate === 0
        ? { cache: 'no-store' as const }
        : { next: { revalidate: init.revalidate ?? 15, tags: [`store:${host.split(':')[0]}`] } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export async function getStore(): Promise<StoreData | null> {
  try {
    const data = await storeApi<StoreData>('/config');
    return { ...data, base: await storeBase() };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getMenu(branchId?: string): Promise<Menu> {
  return storeApi<Menu>(`/menu${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`);
}
