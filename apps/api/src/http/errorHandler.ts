import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../services/errors';
import { TenantScopeError } from '../db/tenantContext';

/** Consistent `{ code, message, details }` errors; never leaks stack traces or query internals. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found' });
  }
  if ((err as any)?.code === 11000) {
    return res.status(409).json({ code: 'DUPLICATE', message: 'A record with these values already exists' });
  }
  if ((err as any)?.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'BAD_JSON', message: 'Malformed JSON body' });
  }
  if (err instanceof TenantScopeError) {
    console.error('[tenant-scope]', err.message); // programmer error: a query ran without tenant context
  } else {
    console.error('[unhandled]', err);
  }
  res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong' });
}
