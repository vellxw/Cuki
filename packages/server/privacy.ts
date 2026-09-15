import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHmac } from 'node:crypto';
import type { Config } from './config';
import { asActor, lockActor, type Database, type Actor } from './db';
import { id, idempotent, need, secureEqual, writeAudit } from './common';
import type { MediaService } from './media';
const personalTables=['entities','entity_history','changes','op_receipts','challenges','garden_credits','plants','coins','reward_quotes','redemptions','billing','quota','jobs','proposals','reports','moderation','audit','media'];
export class PrivacyService {
 readonly dir:string;
 constructor(readonly db:Database,readonly config:Config,readonly media:MediaService){this.dir=resolve(config.mediaDir,'exports');}
 private token(mid:string,actor:string,expiry:number){return createHmac('sha256',this.config.mediaKey).update(`export:${mid}:${actor}:${expiry}`).digest('base64url');}
 async request(actor:Actor,kind:'export'|'delete',key:string,now=new Date()){return asActor(this.db,actor,async tx=>{await lockActor(tx,actor.id);return idempotent(tx,actor,'privacy:'+kind+':'+key,{kind},async()=>{const old=(await tx.query("SELECT id,state FROM privacy_jobs WHERE actor_id=$1 AND kind=$2 AND state IN ('queued','running')",[actor.id,kind])).rows[0];if(old)return old;const mid=id();await tx.query("INSERT INTO privacy_jobs(id,actor_id,kind,state,created_at,updated_at) VALUES($1,$2,$3,'queued',$4,$4)",[mid,actor.id,kind,now.toISOString()]);if(kind==='delete'){await tx.query("UPDATE jobs SET state='cancelled',error='Cuenta en proceso de eliminación',lease_token=NULL WHERE actor_id=$1 AND state IN ('queued','running')",[actor.id]);}return{id:mid,state:'queued'};});});}
 async list(actor:Actor,now=new Date()){return asActor(this.db,actor,async tx=>(await tx.query("SELECT * FROM privacy_jobs WHERE actor_id=$1 AND kind='export' ORDER BY created_at DESC LIMIT 30",[actor.id])).rows.map(r=>{const expiration=+new Date(r.updated_at)+86400000,exp=+now+300000;return{id:r.id,state:r.state,error:r.error,downloadUrl:r.state==='completed'&&expiration>+now?`${this.config.origin}/v1/privacy/download/${r.id}?actor=${encodeURIComponent(actor.id)}&expires=${exp}&token=${this.token(r.id,actor.id,exp)}`:undefined};}));}
 async download(mid:string,actor:string,expiry:string,token:string,now=new Date()){need(/^[0-9a-f-]{36}$/i.test(mid)&&Number.isFinite(Number(expiry))&&Number(expiry)>+now&&Number(expiry)<+now+301000,'Enlace vencido.',403);need(secureEqual(token,this.token(mid,actor,Number(expiry))),'Enlace inválido.',403);const row=(await this.db.query("SELECT id FROM privacy_jobs WHERE id=$1 AND actor_id=$2 AND kind='export' AND state='completed' AND updated_at>$3",[mid,actor,new Date(+now-86400000).toISOString()])).rows[0];need(row,'Exportación no disponible.',404);return readFile(join(this.dir,mid+'.json'));}
 async processOne(now=new Date()){
  const job=await this.db.transaction(async tx=>{const row=(await tx.query("SELECT * FROM privacy_jobs WHERE state='queued' OR (state='running' AND lease_until<$1) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",[now.toISOString()])).rows[0];if(!row)return null;await tx.query("UPDATE privacy_jobs SET state='running',attempts=attempts+1,lease_until=$1,updated_at=$2 WHERE id=$3",[new Date(+now+120000).toISOString(),now.toISOString(),row.id]);return row;});if(!job)return false;
  try{
   if(job.kind==='export'){
    const result=await this.db.transaction(async tx=>{const data:Record<string,unknown>={format:'cuki-export-1',generatedAt:now.toISOString()};for(const table of personalTables.filter(t=>!['op_receipts','changes','audit','quota'].includes(t))){const rows=(await tx.query(`SELECT * FROM ${table} WHERE actor_id=$1`,[job.actor_id])).rows;data[table]=rows.map(r=>{const {actor_id,...rest}=r;return rest;});}return data;});await mkdir(this.dir,{recursive:true,mode:0o700});await writeFile(join(this.dir,job.id+'.json'),JSON.stringify(result,null,2),{mode:0o600});
    await this.db.query("UPDATE privacy_jobs SET state='completed',result=$1::jsonb,updated_at=$2,lease_until=NULL WHERE id=$3",[JSON.stringify({format:'json',expiresInSeconds:86400}),now.toISOString(),job.id]);
   }else{
    // Invalidate tokens first. A retry can finish a partially completed object/provider purge.
    await this.db.query('INSERT INTO deleted_accounts(actor_id,deleted_at) VALUES($1,$2) ON CONFLICT DO NOTHING',[job.actor_id,now.toISOString()]);await this.db.query('UPDATE local_sessions SET revoked_at=$1 WHERE actor_id=$2',[now.toISOString(),job.actor_id]);
    await this.media.purge(job.actor_id);
    const exports=(await this.db.query("SELECT id FROM privacy_jobs WHERE actor_id=$1 AND kind='export'",[job.actor_id])).rows;for(const row of exports)await rm(join(this.dir,row.id+'.json'),{force:true});
    if(this.config.authMode==='supabase'){need(this.config.supabaseSecretKey,'Falta configurar la eliminación del proveedor de identidad.',503);const res=await fetch(`${this.config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(job.actor_id)}`,{method:'DELETE',headers:{apikey:this.config.supabaseSecretKey,Authorization:'Bearer '+this.config.supabaseSecretKey},signal:AbortSignal.timeout(15000)});need(res.ok||res.status===404,'La eliminación del proveedor necesita reintento.',503);}
    await this.db.transaction(async tx=>{await lockActor(tx,job.actor_id);for(const table of ['redemptions','reward_quotes','coins','plants','garden_credits','challenges','jobs','proposals','quota','billing','billing_refresh','moderation','reports','audit','changes','entity_history','entities','op_receipts','media','local_mail','local_sessions'])await tx.query(`DELETE FROM ${table} WHERE actor_id=$1`,[job.actor_id]);await tx.query('DELETE FROM local_users WHERE id=$1',[job.actor_id]);await tx.query('DELETE FROM privacy_jobs WHERE actor_id=$1 AND id<>$2',[job.actor_id,job.id]);await tx.query("UPDATE privacy_jobs SET state='completed',result=NULL,error=NULL,updated_at=$1,lease_until=NULL WHERE id=$2",[now.toISOString(),job.id]);});
   }
  }catch{await this.db.query("UPDATE privacy_jobs SET state=$1,error='La operación necesita reintento operativo.',updated_at=$2,lease_until=NULL WHERE id=$3",[job.attempts>=4?'failed':'queued',now.toISOString(),job.id]);}
  return true;
 }
}
