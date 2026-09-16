import { z } from 'zod';
import type { Actor, Database, SQL } from './db';
import { asActor, lockActor } from './db';
import { need, id, parseBody, writeAudit } from './common';
import { own, readableRecipe, saveEntity, type Entity } from './entities';
import type { Recipe, Food, Comment } from '../core/types';
import foods from '../core/catalog.json';
import recipes from '../core/recipes.json';
import { normalize } from '../core/utils';
import type { MediaService } from './media';
const escaped=(s:string)=>s.replace(/[\\%_]/g,'\\$&');
async function blocked(tx:SQL,actor:Actor){return new Set((await tx.query("SELECT id FROM entities WHERE actor_id=$1 AND entity_type='blockedIds' AND NOT deleted AND payload->>'enabled'='true'",[actor.id])).rows.map(r=>r.id));}
async function hydrated(tx:SQL,row:Recipe,media:MediaService,now:Date):Promise<Recipe>{const votes=(await tx.query<{n:string}>("SELECT count(*) AS n FROM entities WHERE entity_type='votedRecipeIds' AND id=$1 AND NOT deleted AND payload->>'enabled'='true'",[row.id])).rows[0];let photoUri=row.photoUri;if(row.assetIds?.[0]){const m=(await tx.query("SELECT id,actor_id FROM media WHERE id=$1 AND actor_id=$2 AND state='ready'",[row.assetIds[0],row.authorId])).rows[0];if(m)photoUri=media.signedRead(m.id,m.actor_id,now);}return{...row,photoUri,upvotes:Number(votes?.n??0)};}
export async function recipeFeed(db:Database,actor:Actor,q:string,cursor:string|undefined,media:MediaService,now=new Date()){
 need(q.length<=150,'Búsqueda demasiado larga.');const offset=cursor?Number(cursor):0;need(Number.isInteger(offset)&&offset>=0&&offset<=10000,'Cursor inválido.');
 return asActor(db,actor,async tx=>{const blockedIds=await blocked(tx,actor);const rows=(await tx.query<Entity>("SELECT * FROM entities WHERE entity_type='recipe' AND NOT deleted AND (payload->>'visibility'='public' OR actor_id=$1) AND ($2='' OR to_tsvector('spanish',coalesce(payload->>'title','')) @@ plainto_tsquery('spanish',$2) OR payload->>'title' ILIKE $3) ORDER BY updated_at DESC,id LIMIT 200",[actor.id,q,'%'+escaped(q)+'%'])).rows;
 const selected=[...rows.map(r=>r.payload as Recipe).filter(r=>!blockedIds.has(r.authorId)),...recipes.filter(r=>normalize(r.title+' '+r.tags.join(' ')).includes(normalize(q))) as Recipe[]];const unique=[...new Map(selected.map(r=>[r.id,r])).values()];const items=await Promise.all(unique.slice(offset,offset+20).map(r=>hydrated(tx,r,media,now)));return{items,cursor:offset+20<unique.length?String(offset+20):null};});
}
export async function recipeDetail(db:Database,actor:Actor,rid:string,media:MediaService,now=new Date()){return asActor(db,actor,async tx=>{const r=await readableRecipe(tx,rid);need(r,'Receta no disponible.',404);need(!(await blocked(tx,actor)).has(r.authorId),'Receta no disponible.',404);return hydrated(tx,r,media,now);});}
export async function comments(db:Database,actor:Actor,rid:string){return asActor(db,actor,async tx=>{need(await readableRecipe(tx,rid),'Receta no disponible.',404);const denied=await blocked(tx,actor);return(await tx.query<Entity>("SELECT * FROM entities WHERE entity_type='comment' AND NOT deleted AND payload->>'recipeId'=$1 AND (payload->>'state'='public' OR actor_id=$2) ORDER BY updated_at ASC,id LIMIT 300",[rid,actor.id])).rows.filter(r=>!denied.has(r.actor_id)).map(r=>r.payload as Comment);});}
export async function foodSearch(db:Database,actor:Actor,q:string){need(q.length<=150,'Búsqueda demasiado larga.');return asActor(db,actor,async tx=>{const rows=(await tx.query<Entity>("SELECT * FROM entities WHERE entity_type='food' AND NOT deleted AND (actor_id=$1 OR payload->>'state'='reviewed') AND ($2='' OR payload->>'name' ILIKE $3) ORDER BY updated_at DESC LIMIT 50",[actor.id,q,'%'+escaped(q)+'%'])).rows;return [...new Map([...(foods as Food[]).filter(f=>normalize(f.name+' '+f.brand).includes(normalize(q))),...rows.map(r=>r.payload as Food)].map(f=>[f.id,f])).values()].slice(0,80);});}
export async function foodDetail(db:Database,actor:Actor,fid:string){const f=(foods as Food[]).find(f=>f.id===fid);if(f)return f;return asActor(db,actor,async tx=>{const row=(await tx.query<Entity>("SELECT * FROM entities WHERE entity_type='food' AND id=$1 AND NOT deleted AND (actor_id=$2 OR payload->>'state'='reviewed')",[fid,actor.id])).rows[0];need(row,'Alimento no disponible.',404);return row.payload as Food;});}
export function validGTIN(code:string){if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code))return false;const digits=code.split('').map(Number),check=digits.pop()!;const sum=digits.reverse().reduce((total,n,i)=>total+n*(i%2===0?3:1),0);return(10-sum%10)%10===check;}
export async function barcodeFood(db:Database,actor:Actor,code:string,market:string){need(validGTIN(code),'El código no tiene un dígito verificador válido.');need(/^[A-Z]{2}$/.test(market),'Mercado inválido.');return asActor(db,actor,async tx=>{const row=(await tx.query<Entity>("SELECT * FROM entities WHERE entity_type='food' AND NOT deleted AND payload->>'gtin'=$1 AND payload->>'market'=$2 AND (actor_id=$3 OR payload->>'state'='reviewed') ORDER BY updated_at DESC LIMIT 1",[code,market,actor.id])).rows[0];return row?.payload as Food|undefined;});}
export async function report(db:Database,actor:Actor,body:unknown,now=new Date()){const b=parseBody(z.object({targetType:z.enum(['recipe','comment','food','user']),targetId:z.string().min(1).max(200),reason:z.string().min(1).max(100),details:z.string().max(4000).default('')}),body);return asActor(db,actor,async tx=>{const mid=id();await tx.query('INSERT INTO reports(id,actor_id,target_type,target_id,reason,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[mid,actor.id,b.targetType,b.targetId,b.reason,b.details,now.toISOString()]);return{id:mid,state:'open'};});}
export async function moderate(db:Database,staff:Actor,mid:string,body:unknown,now=new Date()){
 need(['admin','moderator'].includes(staff.role),'Acceso de moderación requerido.',403);const b=parseBody(z.object({decision:z.enum(['approve','reject','needs_changes']),reason:z.string().min(3).max(3000),version:z.number().int().positive()}),body);
 return asActor(db,staff,async tx=>{const ticket=(await tx.query('SELECT * FROM moderation WHERE id=$1 FOR UPDATE',[mid])).rows[0];need(ticket,'Revisión inexistente.',404);await lockActor(tx,ticket.actor_id);need(ticket.state==='pending','La revisión ya fue procesada.',409);const entity=await own(tx,ticket.actor_id,ticket.entity_type,ticket.entity_id);need(entity&&entity.version===b.version&&ticket.version===b.version,'El autor publicó una versión más reciente.',409);const payload={...entity.payload};
 if(ticket.entity_type==='recipe')payload.visibility=b.decision==='approve'?'public':b.decision==='reject'?'withdrawn':'private';
 else if(ticket.entity_type==='food')payload.state=b.decision==='approve'?'reviewed':b.decision==='reject'?'rejected':'needs_changes';
 else{need(b.decision!=='approve'||await readableRecipe(tx,payload.recipeId),'La receta no existe.');payload.state=b.decision==='approve'?'public':b.decision==='reject'?'deleted':'pending';}
 await saveEntity(tx,ticket.actor_id,ticket.entity_type,ticket.entity_id,payload,entity.version,b.decision==='reject'&&ticket.entity_type==='comment',now.toISOString());await tx.query('UPDATE moderation SET state=$1,reason=$2 WHERE id=$3',[b.decision,b.reason,mid]);await writeAudit(tx,ticket.actor_id,'moderation.'+b.decision,entity.id,now.toISOString(),{version:entity.version,reason:b.reason},staff.id);return{reviewed:true};});
}
export async function appeal(db:Database,actor:Actor,mid:string,body:unknown,now=new Date()){const b=parseBody(z.object({reason:z.string().min(5).max(3000)}),body);return asActor(db,actor,async tx=>{const ticket=(await tx.query('SELECT * FROM moderation WHERE id=$1 AND actor_id=$2',[mid,actor.id])).rows[0];need(ticket&&ticket.state!=='pending','No hay una decisión apelable.',404);const rid=id();await tx.query('INSERT INTO reports(id,actor_id,target_type,target_id,reason,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[rid,actor.id,'moderation',mid,'appeal',b.reason,now.toISOString()]);return{id:rid,state:'open'};});}

/** Return only versions this actor can read. Private source history never becomes
 * public merely because the current product was reviewed. */
export async function foodVersions(db: Database, actor: Actor, fid: string): Promise<Food[]> {
  const current = await foodDetail(db, actor, fid);
  if (current.state === 'editorial') return [current];
  return asActor(db, actor, async tx => {
    const rows = (await tx.query<{payload: Food}>(
      "SELECT payload FROM entity_history WHERE entity_type='food' AND id=$1 AND actor_id=$2 AND NOT deleted ORDER BY version DESC LIMIT 200",
      [fid, current.ownerId ?? actor.id])).rows;
    const available = new Map<number, Food>(rows.map(row => [row.payload.version, row.payload]));
    available.set(current.version, current);
    return [...available.values()].sort((a, b) => b.version - a.version);
  });
}
