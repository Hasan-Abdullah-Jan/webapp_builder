import { getEnv, redactMongoUri } from './config/env';
import { connectToDatabase, disconnectFromDatabase } from './db/connection';
import { runAsPlatform } from './db/tenantContext';
import { seedPlans } from './models';
import { startNotificationWorker } from './workers/notifications';
import { startCachePurgeWorker } from './workers/cachePurge';
import { createApp } from './app';

async function main() {
  const env = getEnv();
  await connectToDatabase();
  console.log(`[db] connected to ${redactMongoUri(env.MONGODB_URI)} (db: ${env.MONGODB_DB_NAME})`);
  await runAsPlatform('startup: seed plans', () => seedPlans());
  startNotificationWorker();
  startCachePurgeWorker();

  const server = createApp().listen(env.PORT, () => console.log(`[api] listening on :${env.PORT}`));

  const shutdown = async (signal: string) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close();
    await disconnectFromDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[api] failed to start:', err.message);
  process.exit(1);
});
