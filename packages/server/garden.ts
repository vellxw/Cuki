import { CURRENT_RENDERER } from '../garden-engine/leaf-raster';
import { randomBytes } from 'node:crypto';
import { boundaries, evaluate, generatePlant, POLICY, windowFor } from '../garden-engine';
import type { GardenChallenge, PlantInstance, Coin, WorkoutSession } from '../core/types';
import { sessionQualifies } from '../core/utils';
import { asActor, lockActor, type Actor, type Database, type SQL } from './db';
import { need, id, idempotent, writeAudit } from './common';
import { sessionWithSets } from './entities';
interface ChallengeRow {id:string;actor_id:string;version:number;state:GardenChallenge['state'];timezone:string;policy_version:string;boundaries:string[];seed:string|number;created_at:Date|string;archived_at:Date|string|null;plant_descriptor?:Omit<ReturnType<typeof generatePlant>,'rendererVersion'> & {rendererVersion:string}}
const iso=(v:Date|string)=>new Date(v).toISOString();
function descriptor(c:ChallengeRow,grownWeeks:number,archivedAt:string|null=null):PlantInstance {
 const shape=c.plant_descriptor??generatePlant(Number(c.seed));return {id:c.id,seed:shape.seed,species:shape.species,generatorVersion:shape.generatorVersion,rendererVersion:shape.rendererVersion,grownWeeks,archivedAt};
}
async function latest(tx:SQL,actor:string){return (await tx.query<ChallengeRow>('SELECT * FROM challenges WHERE actor_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE',[actor])).rows[0];}
/** Credits are an immutable receipt of an eligible session received by the server, not a claim of biometric verification. */
export async function refreshChallenge(tx:SQL,actor:Actor,c:ChallengeRow,now:Date):Promise<GardenChallenge>{
 if(c.state==='active'){
  const candidates=(await tx.query<{id:string;updated_at:Date|string}>(`SELECT id,updated_at FROM entities WHERE actor_id=$1 AND entity_type='session' AND NOT deleted AND payload->>'status'='completed' ORDER BY updated_at,id`,[actor.id])).rows;
  for(const candidate of candidates){
   if((await tx.query('SELECT session_id FROM garden_credits WHERE actor_id=$1 AND session_id=$2',[actor.id,candidate.id])).rows.length)continue;
   const session=await sessionWithSets(tx,actor.id,candidate.id);
   if(!session||!sessionQualifies(session)||!session.endedAt||Date.parse(session.startedAt)<Date.parse(c.boundaries[0]))continue;
   // Credit depends on when the complete eligible record is actually available, including its set records.
   const index=windowFor(c.boundaries,session.endedAt,now.toISOString());if(index<0)continue;
   await tx.query(`INSERT INTO garden_credits(challenge_id,actor_id,week_index,session_id,received_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[c.id,actor.id,index,session.id,now.toISOString()]);
  }
 }
 const receipts=(await tx.query<{week_index:number;session_id:string;received_at:Date|string}>('SELECT * FROM garden_credits WHERE challenge_id=$1 AND actor_id=$2 ORDER BY week_index',[c.id,actor.id])).rows;
 const calculated=evaluate(c.boundaries,receipts.map(x=>x.week_index),now.toISOString());
 if((c.state==='active'||c.state==='ready_to_harvest')&&c.state!==calculated.state){c.state=calculated.state;c.version++;await tx.query('UPDATE challenges SET state=$1,version=$2 WHERE id=$3 AND actor_id=$4',[c.state,c.version,c.id,actor.id]);}
 const archived=c.archived_at?iso(c.archived_at):null;
 return {id:c.id,version:c.version,state:c.state,timezone:c.timezone,policyVersion:c.policy_version,boundaries:c.boundaries,serverNow:now.toISOString(),startAt:c.boundaries[0],endAt:c.boundaries[52],creditedWeeks:receipts.length,plant:descriptor(c,receipts.length,archived),weeks:calculated.windows.map(w=>{const credit=receipts.find(r=>r.week_index===w.index-1);return {index:w.index,startAt:w.start,endAt:w.end,state:w.state as GardenChallenge['weeks'][number]['state'],credit:credit?{sessionId:credit.session_id,receivedAt:iso(credit.received_at)}:null};})};
}
export async function getGarden(db:Database,actor:Actor,now=new Date()){return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);const c=await latest(tx,actor.id);return c?refreshChallenge(tx,actor,c,now):null;});}
export async function enroll(db:Database,actor:Actor,timezone:string,policy:string,key:string,now=new Date()){
 need(actor.verified,'Verificá tu correo para iniciar el desafío.',403);need(policy===POLICY,'Revisá la versión de las condiciones.');try{new Intl.DateTimeFormat('es',{timeZone:timezone});}catch{need(false,'Zona horaria inválida.');}
 return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);return idempotent(tx,actor,'garden:enroll:'+key,{timezone,policy},async()=>{const previous=await latest(tx,actor.id);if(previous){const status=await refreshChallenge(tx,actor,previous,now);need(['harvested','archived'].includes(status.state),'Guardá o cosechá la planta actual antes de comenzar otra.',409);}const row:ChallengeRow={id:id(),actor_id:actor.id,version:1,state:'active',timezone,policy_version:policy,boundaries:boundaries(now.toISOString(),timezone),seed:randomBytes(4).readUInt32LE(),created_at:now.toISOString(),archived_at:null};row.plant_descriptor={...generatePlant(Number(row.seed)),rendererVersion:CURRENT_RENDERER};await tx.query('INSERT INTO challenges(id,actor_id,version,state,timezone,policy_version,boundaries,seed,created_at,plant_descriptor) VALUES($1,$2,1,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)',[row.id,actor.id,row.state,timezone,policy,JSON.stringify(row.boundaries),row.seed,now.toISOString(),JSON.stringify(row.plant_descriptor)]);await writeAudit(tx,actor.id,'garden.enroll',row.id,now.toISOString(),{policy,timezone});return refreshChallenge(tx,actor,row,now);});});
}
export async function archiveGarden(db:Database,actor:Actor,key:string,now=new Date()){
 return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);return idempotent(tx,actor,'garden:archive:'+key,{},async()=>{const c=await latest(tx,actor.id);need(c,'No hay una planta activa.',404);const g=await refreshChallenge(tx,actor,c,now);need(!['harvested','archived'].includes(g.state),'La planta ya está guardada.',409);const plant=descriptor(c,g.creditedWeeks,now.toISOString());await tx.query('INSERT INTO plants(id,actor_id,challenge_id,descriptor,archived_at) VALUES($1,$2,$3,$4::jsonb,$5)',[plant.id,actor.id,c.id,JSON.stringify(plant),now.toISOString()]);await tx.query("UPDATE challenges SET state='archived',archived_at=$1,version=version+1 WHERE id=$2",[now.toISOString(),c.id]);await writeAudit(tx,actor.id,'garden.archive',c.id,now.toISOString(),{grownWeeks:g.creditedWeeks,reward:false});return {plant};});});
}
export async function harvest(db:Database,actor:Actor,key:string,now=new Date()){
 return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);return idempotent(tx,actor,'garden:harvest:'+key,{},async()=>{const c=await latest(tx,actor.id);need(c,'No hay una planta.',404);const g=await refreshChallenge(tx,actor,c,now);
  if(g.state==='harvested'){const plant=(await tx.query<{descriptor:PlantInstance}>('SELECT descriptor FROM plants WHERE challenge_id=$1',[c.id])).rows[0];const coin=(await tx.query<any>('SELECT * FROM coins WHERE challenge_id=$1',[c.id])).rows[0];need(plant&&coin,'Recompensa en revisión.',409);return {plant:plant.descriptor,coin:coinOf(coin)};}
  need(g.state==='ready_to_harvest'&&g.creditedWeeks===52&&+now>=Date.parse(g.endAt),'Todavía no se completaron y cerraron las 52 semanas.',409);
  const plant=descriptor(c,52,now.toISOString()),coin:Coin={id:id(),challengeId:c.id,state:'available',earnedAt:now.toISOString()};
  await tx.query('INSERT INTO plants(id,actor_id,challenge_id,descriptor,archived_at) VALUES($1,$2,$3,$4::jsonb,$5)',[plant.id,actor.id,c.id,JSON.stringify(plant),now.toISOString()]);await tx.query("INSERT INTO coins(id,actor_id,challenge_id,state,earned_at) VALUES($1,$2,$3,'available',$4)",[coin.id,actor.id,c.id,coin.earnedAt]);await tx.query("UPDATE challenges SET state='harvested',archived_at=$1,version=version+1 WHERE id=$2",[now.toISOString(),c.id]);await writeAudit(tx,actor.id,'garden.harvest',c.id,now.toISOString(),{coinId:coin.id,plantId:plant.id,policy:POLICY});return {plant,coin};});});
}
export const coinOf=(row:any):Coin=>({id:row.id,challengeId:row.challenge_id,state:row.state,earnedAt:iso(row.earned_at)});
export async function collection(db:Database,actor:Actor){return asActor(db,actor,async tx=>(await tx.query<{descriptor:PlantInstance}>('SELECT descriptor FROM plants WHERE actor_id=$1 ORDER BY archived_at DESC',[actor.id])).rows.map(r=>r.descriptor));}
export async function wallet(db:Database,actor:Actor){return asActor(db,actor,async tx=>(await tx.query('SELECT * FROM coins WHERE actor_id=$1 ORDER BY earned_at DESC',[actor.id])).rows.map(coinOf));}
