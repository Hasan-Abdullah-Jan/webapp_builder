import mongoose from 'mongoose';
import { getEnv, redactMongoUri } from '../config/env';
import { connectToDatabase, disconnectFromDatabase, pingDatabase } from '../db/connection';

/** Connectivity check: connect, ping, report server info. Prints no credentials and writes nothing. */
async function main() {
  const env = getEnv();
  console.log(`Target:   ${redactMongoUri(env.MONGODB_URI)}`);
  console.log(`Database: ${env.MONGODB_DB_NAME}`);
  const t0 = Date.now();
  await connectToDatabase({ autoIndex: false });
  console.log(`Connect:  OK in ${Date.now() - t0} ms`);
  const ping = await pingDatabase();
  console.log(`Ping:     ${ping.ok ? 'OK' : 'FAILED'} (${ping.latencyMs} ms)`);
  const db = mongoose.connection.db!;
  const hello = await db.admin().command({ hello: 1 });
  const info = await db.admin().command({ buildInfo: 1 });
  console.log(`Server:   MongoDB ${info.version}, replica set: ${hello.setName ?? 'none'}`);
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  console.log(`Collections in ${db.databaseName}: ${cols.map((c) => c.name).sort().join(', ') || '(none yet — run npm run db:indexes)'}`);
  await disconnectFromDatabase();
}

main().catch(async (err) => {
  console.error(`FAILED: ${err.message}`);
  await disconnectFromDatabase().catch(() => {});
  process.exit(1);
});
