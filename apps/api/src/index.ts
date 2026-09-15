import { configuration } from '../../../packages/server/config';
import { embedded, migrate, postgres } from '../../../packages/server/db';
import { createApp } from './app';
import { processOneAI } from '../../../packages/server/ai';
const config=configuration();const db=config.databaseUrl?postgres(config.databaseUrl):await embedded(config.embeddedPath??'.local/postgres');await migrate(db);const service=await createApp({db,config});
let stopping=false,busy=false;
// PGlite has one process owner. Local jobs share its instance; production uses the standalone worker.
const timer=config.databaseUrl?null:setInterval(async()=>{if(busy||stopping)return;busy=true;try{await service.privacy.processOne();await processOneAI(db,service.ai,service.media);}catch{console.error('Local worker iteration failed; inspect the administrative queue.');}finally{busy=false;}},1000);
await service.app.listen({host:config.host,port:config.port});console.log(`CUKI API ready on ${config.origin} (${config.env}).`);
async function stop(){if(stopping)return;stopping=true;if(timer)clearInterval(timer);await service.app.close();while(busy)await new Promise(r=>setTimeout(r,50));await db.close();}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
