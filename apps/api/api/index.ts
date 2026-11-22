import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/app';
import { ensureReady } from '../src/bootstrap';

/**
 * Vercel serverless entry: every request is routed here (see vercel.json) and handled by the
 * same Express app the long-running server uses.
 */
const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ensureReady();
  } catch (err) {
    console.error('[api] startup failed:', (err as Error).message);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ code: 'DB_UNAVAILABLE', message: 'Database unavailable, please retry shortly' }));
    return;
  }
  return (app as unknown as (rq: IncomingMessage, rs: ServerResponse) => void)(req, res);
}
