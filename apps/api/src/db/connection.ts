import mongoose from 'mongoose';
import { getEnv, redactMongoUri } from '../config/env';

let connecting: Promise<typeof mongoose> | undefined;

export interface ConnectOptions {
  uri?: string;
  dbName?: string;
  /** Build indexes on startup. Off in production: use `npm run db:indexes` instead. */
  autoIndex?: boolean;
}

/**
 * Open (or reuse) the single shared Mongoose connection. Safe to call many times.
 * Server-side only: this module must never be imported by browser bundles.
 */
export async function connectToDatabase(opts: ConnectOptions = {}): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;

  const env = opts.uri ? undefined : getEnv();
  const uri = opts.uri ?? env!.MONGODB_URI;
  const dbName = opts.dbName ?? env?.MONGODB_DB_NAME;
  const autoIndex = opts.autoIndex ?? (process.env.NODE_ENV !== 'production');

  // Drop filter keys that are not in the schema. Request input is validated with Zod
  // before it reaches a query, so user-supplied objects never become raw filters.
  mongoose.set('strictQuery', true);

  connecting = mongoose
    .connect(uri, {
      dbName,
      autoIndex,
      maxPoolSize: 20,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      retryWrites: true,
      w: 'majority',
      appName: 'quickstore-api',
    })
    .catch((err) => {
      connecting = undefined;
      throw new Error(`MongoDB connection failed (${redactMongoUri(uri)}): ${err.message}`);
    });

  return connecting;
}

export async function disconnectFromDatabase(): Promise<void> {
  connecting = undefined;
  await mongoose.disconnect();
}

/** Round-trip ping used by health checks. */
export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const db = mongoose.connection.db;
  if (!db) return { ok: false, latencyMs: -1 };
  const start = Date.now();
  const res = await db.admin().command({ ping: 1 });
  return { ok: res.ok === 1, latencyMs: Date.now() - start };
}
