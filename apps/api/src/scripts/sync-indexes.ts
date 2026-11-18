import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { ALL_MODELS } from '../models';

/** Creates collections and builds/updates all declared indexes. Run on deploy. */
async function main() {
  await connectToDatabase({ autoIndex: false });
  for (const model of ALL_MODELS) {
    await model.createCollection().catch((e: any) => { if (e?.codeName !== 'NamespaceExists') throw e; });
    const dropped = await model.syncIndexes();
    const indexes = await model.listIndexes();
    console.log(`${model.collection.collectionName.padEnd(14)} ${indexes.length} indexes${dropped.length ? ` (dropped stale: ${dropped.join(', ')})` : ''}`);
  }
  const db = (await import('mongoose')).default.connection.db!;
  await db.collection('media.files').createIndex({ 'metadata.tenantId': 1, uploadDate: -1 });
  console.log('media.files    tenant index ensured');
  await disconnectFromDatabase();
}

main().catch(async (err) => {
  console.error('[db:indexes] failed:', err.message);
  await disconnectFromDatabase().catch(() => {});
  process.exit(1);
});
