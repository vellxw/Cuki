import { createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import type { Config } from './config';
import { asActor, type Actor, type Database } from './db';
import { id, need, parseBody, secureEqual, sha256 } from './common';
const spec=z.object({purpose:z.enum(['recipe','food','photo','label','voice','scan','avatar']),mime:z.enum(['image/jpeg','image/png','image/webp','audio/mp4','audio/m4a','audio/mpeg']),bytes:z.number().int().positive().max(12_000_000)});
interface Signed {id:string;actor:string;action:'put'|'get';expires:number}
export class MediaService {
 readonly dir:string;
 constructor(readonly db:Database,readonly config:Config){this.dir=resolve(config.mediaDir);}
 private path(mid:string){need(/^[0-9a-f-]{36}$/i.test(mid),'Archivo inválido.');return join(this.dir,mid);}
 private sign(value:Signed){const text=Buffer.from(JSON.stringify(value)).toString('base64url');return text+'.'+createHmac('sha256',this.config.mediaKey).update(text).digest('base64url');}
 private decode(token:string,mid:string,action:Signed['action'],now:Date){const [value,signature,...extra]=token.split('.');need(value&&signature&&!extra.length,'Enlace inválido.',403);const expected=createHmac('sha256',this.config.mediaKey).update(value).digest('base64url');need(secureEqual(expected,signature),'Enlace inválido.',403);let payload:Signed;try{payload=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{need(false,'Enlace inválido.',403);}need(payload!.id===mid&&payload!.action===action&&Number.isFinite(payload!.expires)&&payload!.expires>+now,'Enlace vencido o inválido.',403);return payload!;}
 async create(actor:Actor,body:unknown,now=new Date()){
  const b=parseBody(spec,body);need(actor.verified,'Verificá tu correo para subir medios.',403);need(b.purpose==='voice'?b.mime.startsWith('audio/'):b.mime.startsWith('image/'),'Tipo de archivo incompatible.');const mid=id(),expiry=new Date(+now+15*60000);
  await asActor(this.db,actor,tx=>tx.query("INSERT INTO media(id,actor_id,purpose,mime,expected_bytes,state,created_at,expires_at) VALUES($1,$2,$3,$4,$5,'created',$6,$7)",[mid,actor.id,b.purpose,b.mime,b.bytes,now.toISOString(),expiry.toISOString()]));
  return{id:mid,url:this.config.origin+'/v1/media/blob/'+mid+'?token='+this.sign({id:mid,actor:actor.id,action:'put',expires:+expiry}),headers:{'Content-Type':'application/octet-stream'}};
 }
 async put(mid:string,token:string,data:Buffer,now=new Date()){
  const signed=this.decode(token,mid,'put',now);const actor:Actor={id:signed.actor,verified:true,role:'user'};
  return asActor(this.db,actor,async tx=>{const row=(await tx.query('SELECT * FROM media WHERE id=$1 AND actor_id=$2 FOR UPDATE',[mid,actor.id])).rows[0];need(row&&+new Date(row.expires_at)>+now,'La carga venció.',404);need(data.length===row.expected_bytes&&data.length<=12_000_000,'Tamaño de archivo incorrecto.');
   if(row.state==='ready')return{uploaded:true};need(row.state==='created','Carga en estado incompatible.',409);
   let cleaned:Buffer,mime:string;
   if(row.mime.startsWith('image/')){try{const input=sharp(data,{limitInputPixels:40_000_000,failOn:'error'});const meta=await input.metadata();need(meta.width&&meta.height&&meta.width>=32&&meta.height>=32,'Imagen demasiado pequeña.');cleaned=await input.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();mime='image/jpeg';}catch{need(false,'No se pudo leer una imagen válida.');}}
   else{const mp4=data.length>12&&data.subarray(4,8).toString()==='ftyp';const mp3=data.subarray(0,3).toString()==='ID3'||data[0]===255&&(data[1]&224)===224;need(mp4||mp3,'Audio no reconocido.');cleaned=data;mime=mp4?'audio/mp4':'audio/mpeg';}
   await mkdir(this.dir,{recursive:true,mode:0o700});const temp=this.path(mid)+'.tmp-'+id();await writeFile(temp,cleaned!,{mode:0o600});await rename(temp,this.path(mid));await tx.query("UPDATE media SET state='ready',mime=$1,digest=$2 WHERE id=$3",[mime!,sha256(cleaned!),mid]);return{uploaded:true};
  });
 }
 async complete(actor:Actor,mid:string){return asActor(this.db,actor,async tx=>{const row=(await tx.query("SELECT * FROM media WHERE id=$1 AND actor_id=$2 AND state='ready'",[mid,actor.id])).rows[0];need(row,'La carga todavía no está confirmada.',409);return{id:mid,ready:true};});}
 async url(actor:Actor,mid:string,now=new Date()){const row=await asActor(this.db,actor,async tx=>(await tx.query("SELECT * FROM media WHERE id=$1 AND actor_id=$2 AND state='ready'",[mid,actor.id])).rows[0]);need(row,'Archivo no encontrado.',404);return this.signedRead(mid,row.actor_id,now);}
 signedRead(mid:string,owner:string,now=new Date()){return this.config.origin+'/v1/media/blob/'+mid+'?token='+this.sign({id:mid,actor:owner,action:'get',expires:+now+300000});}
 async get(mid:string,token:string,now=new Date()){const claim=this.decode(token,mid,'get',now);return this.readForActor(claim.actor,mid);}
 async readForActor(actorId:string,mid:string){const rows=(await this.db.query("SELECT * FROM media WHERE id=$1 AND actor_id=$2 AND state='ready' AND NOT EXISTS(SELECT 1 FROM deleted_accounts WHERE actor_id=$2)",[mid,actorId])).rows;need(rows[0],'Archivo no encontrado.',404);const data=await readFile(this.path(mid));return{data,mime:rows[0].mime};}
 async purge(actorId:string){const rows=(await this.db.query('SELECT id FROM media WHERE actor_id=$1',[actorId])).rows;for(const row of rows)await rm(this.path(row.id),{force:true});}
 async prune(now=new Date()){const rows=(await this.db.query("SELECT id FROM media WHERE state='created' AND expires_at<$1 LIMIT 200",[now.toISOString()])).rows;for(const row of rows){await rm(this.path(row.id),{force:true});await this.db.query("DELETE FROM media WHERE id=$1 AND state='created'",[row.id]);}return rows.length;}
}
