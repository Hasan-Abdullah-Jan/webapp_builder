import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { adminRouter } from './http/routes/admin';
import { storeRouter } from './http/routes/store';
import { authRouter, platformAuthRouter } from './http/routes/auth';
import { platformRouter } from './http/routes/platform';
import { publicRouter } from './http/routes/public';
import { errorHandler } from './http/errorHandler';
import { pingDatabase } from './db/connection';
import { streamImage } from './services/media';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // The API sits behind the Next.js servers / a load balancer; trust one proxy hop for req.ip.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', async (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    const db = connected ? await pingDatabase().catch(() => ({ ok: false, latencyMs: -1 })) : { ok: false, latencyMs: -1 };
    res.status(db.ok ? 200 : 503).json({ status: db.ok ? 'ok' : 'degraded', db });
  });

  app.get('/v1/media/:id', (req, res, next) => {
    streamImage(String(req.params.id), res).catch(next);
  });
  app.use('/v1/auth', authRouter());
  app.use('/v1/public', publicRouter());
  app.use('/v1/admin', adminRouter());
  app.use('/v1/store', storeRouter());
  app.use('/v1/platform/auth', platformAuthRouter());
  app.use('/v1/platform', platformRouter());
  app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
