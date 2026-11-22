import { connectToDatabase } from './db/connection';
import { runAsPlatform } from './db/tenantContext';
import { seedPlans } from './models';
import { startNotificationWorker } from './workers/notifications';

let ready: Promise<void> | undefined;

/**
 * One-time startup shared by the long-running server and serverless functions: connect to
 * MongoDB (connection is reused across invocations of a warm function), seed default plans,
 * start in-process listeners. Safe to call on every request.
 */
export function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await connectToDatabase({ autoIndex: false });
      await runAsPlatform('startup: seed plans', () => seedPlans());
      startNotificationWorker();
    })().catch((err) => {
      ready = undefined; // retry on the next request
      throw err;
    });
  }
  return ready;
}
