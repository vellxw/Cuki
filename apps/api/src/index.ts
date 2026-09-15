import { configuration } from '../../../packages/server/config';
import { embedded, migrate, postgres } from '../../../packages/server/db';
import { createApp } from './app';
import { WorkerLoop } from '../../../packages/server/worker';
const config = configuration();
const db = config.databaseUrl ? postgres(config.databaseUrl) : await embedded(config.embeddedPath ?? '.local/postgres');
await migrate(db);
const service = await createApp({ db, config });
const worker = new WorkerLoop({ db, ...service });
let stopping = false;
let current: Promise<boolean> | null = null;
// PGlite has one process owner. All local queues share its instance, including rewards and billing reconciliation.
const timer = config.databaseUrl ? null : setInterval(() => {
  if (current || stopping) return;
  current = worker.tick().catch(() => { console.error('Local worker iteration failed; jobs remain in the administrative queue.'); return false; }).finally(() => { current = null; });
}, 2000);
await service.app.listen({ host: config.host, port: config.port });
console.log(`CUKI API ready on ${config.origin} (${config.env}).`);
async function stop() {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  await service.app.close();
  await current;
  await db.close();
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
