'use client';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

/** Browser → same-origin proxy → API. Throws ApiError with a human message. */
export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const res = await fetch(`/api/proxy/${path.replace(/^\//, '')}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'x-qs-csrf': '1' } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
    throw new ApiError(401, 'UNAUTHORIZED', 'Please log in');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.details) && body.details[0]?.message
      ? `${body.details[0].path ? body.details[0].path + ': ' : ''}${body.details[0].message}`
      : '';
    throw new ApiError(res.status, body.code ?? 'ERROR', detail && body.code === 'VALIDATION_ERROR' ? detail : body.message ?? 'Something went wrong', body.details);
  }
  return body as T;
}

export async function publicApi<T = any>(path: string): Promise<T> {
  const res = await fetch(`/api/public/${path}`, { cache: 'no-store' });
  return res.json();
}

export async function authCall(action: 'login' | 'signup' | 'logout', body?: unknown) {
  const res = await fetch(`/api/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.details) && data.details[0]?.message ? data.details[0].message : '';
    throw new ApiError(res.status, data.code ?? 'ERROR', detail || data.message || 'Something went wrong');
  }
  return data;
}

export function money(n: number | undefined, currency = 'PKR') {
  const v = Math.round(n ?? 0);
  return currency === 'PKR' ? `Rs. ${v.toLocaleString('en-PK')}` : `${currency} ${v.toLocaleString()}`;
}

const TEMPLATE = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'http://{slug}.localhost:3000';
export function storeUrl(slug: string) {
  return TEMPLATE.replace('{slug}', slug);
}

export function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'New', confirmed: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
};
