import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { adminRouter } from './http/routes/admin';
import { storeRouter } from './http/routes/store';
import { errorHandler } from './http/errorHandler';
import { pingDatabase } from './db/connection';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', async (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    const db = connected ? await pingDatabase().catch(() => ({ ok: false, latencyMs: -1 })) : { ok: false, latencyMs: -1 };
    res.status(db.ok ? 200 : 503).json({ status: db.ok ? 'ok' : 'degraded', db });
  });

  app.use('/v1/admin', adminRouter());
  app.use('/v1/store', storeRouter());
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
