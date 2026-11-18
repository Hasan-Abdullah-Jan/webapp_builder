'use client';

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const res = await fetch(`/api/proxy/${path.replace(/^\//, '')}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'x-qs-csrf': '1' } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Please log in');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.details?.[0]?.message ?? body.message ?? 'Something went wrong');
  return body as T;
}

export const pkr = (n: number) => `Rs. ${Math.round(n ?? 0).toLocaleString('en-PK')}`;

const TEMPLATE = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'http://{slug}.localhost:3000';
export const storeUrl = (slug: string) => TEMPLATE.replace('{slug}', slug);
