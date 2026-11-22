import { NextResponse } from 'next/server';

const API = process.env.API_URL ?? 'http://localhost:4000';

/**
 * When the API can't be reached (not started locally, or API_URL not set on Vercel), answer
 * with a clear JSON error instead of crashing the route.
 */
export function withApiErrors<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error('[api-proxy] API unreachable:', API, (err as Error).message);
      return NextResponse.json(
        { code: 'API_UNREACHABLE', message: `Can't reach the API at ${API}. Start it with "npm run dev:api", or set API_URL.` },
        { status: 503 },
      );
    }
  };
}
