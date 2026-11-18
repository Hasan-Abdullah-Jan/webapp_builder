import type { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

/** Runs an async handler and sends its return value as JSON (unless it already responded). */
export const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .then((body) => {
      if (!res.headersSent) res.json(body);
    })
    .catch(next);
};

export const created = (fn: Handler) =>
  wrap(async (req, res) => {
    res.status(201);
    return fn(req, res);
  });

export const userAgent = (req: Request) => (req.headers['user-agent'] ?? '').slice(0, 300);
