import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';

/**
 * Small in-memory fixed-window limiter. Fine for a single API instance; swap the store for
 * Redis (plan §12.3) when running more than one container.
 */
export function rateLimit(opts: { windowMs: number; max: number; name: string; key?: (req: Request) => string }) {
  const hits = new Map<string, { count: number; reset: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, opts.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test' && !process.env.RATE_LIMIT_IN_TESTS) return next();
    const k = `${opts.name}:${opts.key ? opts.key(req) : req.ip}`;
    const now = Date.now();
    let e = hits.get(k);
    if (!e || e.reset < now) {
      e = { count: 0, reset: now + opts.windowMs };
      hits.set(k, e);
    }
    e.count++;
    if (e.count > opts.max) {
      res.setHeader('Retry-After', Math.ceil((e.reset - now) / 1000));
      return next(new AppError(429, 'RATE_LIMITED', 'Too many requests, please slow down'));
    }
    next();
  };
}
