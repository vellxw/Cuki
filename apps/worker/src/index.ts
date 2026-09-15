import { configuration } from '../../../packages/server/config';
import { migrate, postgres } from '../../../packages/server/db';
import { StructuredAI } from '../../../packages/server/ai';
import { MediaService } from '../../../packages/server/media';
import { PrivacyService } from '../../../packages/server/privacy';
import { RevenueCat } from '../../../packages/server/billing';
import { WorkerLoop } from '../../../packages/server/worker';
const config = configuration();
if (!config.databaseUrl) throw new Error('El worker independiente requiere DATABASE_URL. En modo PGlite, api procesa su cola local.');
const db = postgres(config.databaseUrl);
await migrate(db);
const media = new MediaService(db, config);
const loop = new WorkerLoop({ db, media, privacy: new PrivacyService(db, config, media), ai: new StructuredAI(config), billing: new RevenueCat(config) });
let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
try {
  while (!stopping) {
    try { await loop.tick(); }
    catch { console.error('Worker iteration failed; durable jobs retained for retry.'); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 2000));
  }
} finally { await db.close(); }
