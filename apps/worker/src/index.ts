import { configuration } from '../../../packages/server/config';
import { postgres } from '../../../packages/server/db';
import { StructuredAI,processOneAI } from '../../../packages/server/ai';
import { MediaService } from '../../../packages/server/media';
import { PrivacyService } from '../../../packages/server/privacy';
import { RevenueCat } from '../../../packages/server/billing';
import { processRedemption,reconcileRedemption } from '../../../packages/server/rewards';
const config=configuration();if(!config.databaseUrl)throw new Error('El worker independiente requiere DATABASE_URL. En modo PGlite, api ya procesa su cola local.');
const db=postgres(config.databaseUrl),ai=new StructuredAI(config),media=new MediaService(db,config),privacy=new PrivacyService(db,config,media),rc=new RevenueCat(config);let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
while(!stopping){try{const didPrivacy=await privacy.processOne(),didAI=await processOneAI(db,ai,media);if(rc.configured){const rows=(await db.query<{id:string;actor_id:string;state:string}>(`SELECT id,actor_id,state FROM redemptions WHERE state IN ('reserved','unknown_reconciling') OR (state='awaiting_provider' AND updated_at<now()-interval '2 minutes') ORDER BY updated_at LIMIT 10`)).rows;for(const r of rows){const actor={id:r.actor_id,verified:true,role:'user' as const};try{if(r.state==='reserved')await processRedemption(db,actor,r.id,rc,new Date());else await reconcileRedemption(db,actor,r.id,rc,new Date());}catch{console.error('Reward reconciliation pending',r.id);}}}if(!didPrivacy&&!didAI)await new Promise(r=>setTimeout(r,2000));}catch{console.error('Worker iteration failed; retrying without discarding jobs.');await new Promise(r=>setTimeout(r,5000));}}
await db.close();
