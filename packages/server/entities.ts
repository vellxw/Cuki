import { entitySchemas, operation, rejectUnsafeKeys } from '../contracts/entities';
import type { Actor, Database, SQL } from './db';
import { asActor, lockActor } from './db';
import { HttpError, need, idempotent, writeAudit } from './common';
import { z } from 'zod';
import { validateEntry, recipeNutrition, stableJSON, scaleNutrients } from '../core/utils';
import type { DiaryEntry, Recipe, WorkoutSession, SetEntry } from '../core/types';
import catalog from '../core/catalog.json';
import editorial from '../core/recipes.json';
export interface Entity {actor_id:string;entity_type:string;id:string;version:number;deleted:boolean;payload:Record<string,any>;updated_at:string}
export function changeOf(e:Entity){return{entityType:e.entity_type,entityId:e.id,version:e.version,deleted:e.deleted,payload:e.payload}}
export async function own(tx:SQL,actor:string,type:string,id:string){return(await tx.query<Entity>('SELECT * FROM entities WHERE actor_id=$1 AND entity_type=$2 AND id=$3',[actor,type,id])).rows[0]}
export async function saveEntity(tx:SQL,actor:string,type:string,id:string,payload:unknown,base:number,deleted=false,now=new Date().toISOString()){
 const old=await own(tx,actor,type,id);need((old?.version??0)===base,'La entidad cambió.',409,);
 const version=base+1;const p={...(payload as object),...(type==='profile'?{}:{id}),version};
 await tx.query('INSERT INTO entities(actor_id,entity_type,id,version,deleted,payload,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(actor_id,entity_type,id) DO UPDATE SET version=EXCLUDED.version,deleted=EXCLUDED.deleted,payload=EXCLUDED.payload,updated_at=EXCLUDED.updated_at',[actor,type,id,version,deleted,JSON.stringify(p),now]);
 await tx.query('INSERT INTO entity_history(actor_id,entity_type,id,version,deleted,payload,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',[actor,type,id,version,deleted,JSON.stringify(p),now]);
 await tx.query('INSERT INTO changes(actor_id,entity_type,entity_id,version,deleted,payload,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',[actor,type,id,version,deleted,JSON.stringify(p),now]);
 return{entityType:type,entityId:id,version,deleted,payload:p};
}
export async function readableRecipe(tx:SQL,id:string):Promise<Recipe|undefined>{const local=editorial.find(r=>r.id===id);if(local)return local as Recipe;const rows=await tx.query<Entity>("SELECT * FROM entities WHERE entity_type='recipe' AND id=$1 AND NOT deleted AND (payload->>'visibility'='public' OR actor_id=cuki_actor())",[id]);return rows.rows[0]?.payload as Recipe|undefined}
export async function sessionWithSets(tx:SQL,actor:string,id:string):Promise<WorkoutSession|null>{const e=await own(tx,actor,'session',id);if(!e||e.deleted)return null;const s=JSON.parse(JSON.stringify(e.payload)) as WorkoutSession;const sets=(await tx.query<Entity>("SELECT * FROM entities WHERE actor_id=$1 AND entity_type='set' AND payload->>'sessionId'=$2 AND NOT deleted ORDER BY updated_at,id",[actor,id])).rows;for(const ex of s.exercises)ex.sets=sets.filter(x=>x.payload.exerciseId===ex.id).map(x=>x.payload as SetEntry);return s}
export async function push(db:Database,actor:Actor,body:unknown,now=new Date()){
 const input=z.object({operations:z.array(operation).min(1).max(50)}).parse(body);rejectUnsafeKeys(input);
 return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);const results:object[]=[];
  for(const op of input.operations){await tx.query('SAVEPOINT sync_op');try{
   const result=await idempotent(tx,actor,op.id,{...op,state:undefined,error:undefined,remote:undefined},async()=>{
    const type=op.entityType;const eid=type==='profile'?actor.id:op.entityId;need(type!=='profile'||op.entityId===actor.id,'Perfil no autorizado.',403);const current=await own(tx,actor.id,type,eid);
    if((current?.version??0)!==op.baseVersion)return{id:op.id,state:'conflict',message:'Hay una versión distinta. Revisá antes de sobrescribir.',remote:current?changeOf(current):{entityType:type,entityId:eid,version:0,deleted:true,payload:{id:eid}}};
    need(Date.parse(op.createdAt)<=+now+300000,'El registro indica una fecha futura.');
    let p:Record<string,any>;
    if(op.deleted){need(current,'No existe el registro que querés borrar.',404);p={...current.payload};if(type==='diary')p.deletedAt=op.createdAt;if(type==='comment')p.state='deleted';}
    else {p=entitySchemas[type].parse(op.payload) as Record<string,any>;need(!('id'in p)||p.id===op.entityId,'Identificador inconsistente.');
     // Preserve the validated operation time, not arrival order or a client-supplied
     // payload timestamp. Offline goals can arrive after newer goals of the same day.
     if(type==='goal')p.updatedAt=op.createdAt;
     if(type==='food'){need(!catalog.some(f=>f.id===eid),'Creá una copia privada de la fuente editorial.');need(['private','pending'].includes(p.state),'No podés verificar un producto desde el cliente.',403);p.ownerId=actor.id;}
     if(type==='recipe'){need(!editorial.some(r=>r.id===eid),'Creá una copia privada de la receta editorial.');need(p.authorId===actor.id&&['private','pending'].includes(p.visibility),'Publicación no autorizada.',403);recipeNutrition(p as Recipe,[]);for(const mediaId of p.assetIds??[]){need((await tx.query("SELECT id FROM media WHERE id=$1 AND actor_id=$2 AND state='ready'",[mediaId,actor.id])).rows.length,'El medio no pertenece a la cuenta.',403);}p.photoUri=null;delete p.upvotes;}
     if(type==='comment'){need(p.authorId===actor.id,'Autor inválido.',403);need(actor.verified,'Confirmá tu correo para comentar.',403);need(await readableRecipe(tx,p.recipeId),'Receta no disponible.',404);p.state='pending';if(p.parentId){const parent=(await tx.query<Entity>("SELECT * FROM entities WHERE entity_type='comment' AND id=$1 AND NOT deleted",[p.parentId])).rows[0];need(parent&&parent.payload.recipeId===p.recipeId,'Comentario padre no disponible.',404);}}
     if(type==='votedRecipeIds')need(actor.verified,'Confirmá tu correo antes de votar.',403);if(type==='votedRecipeIds'||type==='savedRecipeIds')need(await readableRecipe(tx,eid),'Receta no disponible.',404);
     if(type==='diary'){const entry=p as DiaryEntry;validateEntry(entry);need(entry.unit!=='serving'||entry.snapshot.recipe,'Falta la receta de origen.');if(entry.unit!=='serving')need(entry.unit===(entry.snapshot.foods[0].basis==='per_100ml'?'ml':'g'),'La unidad no coincide con la fuente.');const expected=entry.unit==='serving'?recipeNutrition(entry.snapshot.recipe!,entry.snapshot.foods,entry.amount):scaleNutrients(entry.snapshot.foods[0].nutrients,entry.amount/100);for(const k of Object.keys(expected) as (keyof typeof expected)[]){const a=expected[k],b=entry.nutrition[k];need(a===null?b===null:typeof b==='number'&&Math.abs(a-b)<.02,'El total no coincide con las fuentes de la comida.');}}
     if(type==='session'){need(p.exercises.every((e:any)=>e.sets.length===0),'Las series se sincronizan individualmente.');need(Date.parse(p.startedAt)<=+now+300000,'Inicio futuro.');if(p.status==='completed'||p.status==='discarded')need(p.endedAt&&Date.parse(p.endedAt)>=Date.parse(p.startedAt)&&Date.parse(p.endedAt)<=+now+300000,'Cierre de sesión inválido.');}
     if(type==='set'){const session=await own(tx,actor.id,'session',p.sessionId);need(session&&!session.deleted,'La sesión todavía no se sincronizó.');need(session.payload.exercises.some((e:any)=>e.id===p.exerciseId),'Ejercicio no perteneciente a la sesión.');if(p.completedAt)need(Date.parse(p.completedAt)>=Date.parse(session.payload.startedAt)&&Date.parse(p.completedAt)<=+now+300000,'Fecha de serie inválida.');}
    }
    const changed=await saveEntity(tx,actor.id,type,eid,p,current?.version??0,op.deleted,now.toISOString());
    const review=!op.deleted&&((type==='recipe'&&p.visibility==='pending')||(type==='food'&&p.state==='pending')||type==='comment');
    if(review){need(actor.verified,'Confirmá tu correo para enviar a revisión.',403);await tx.query('INSERT INTO moderation(id,actor_id,entity_type,entity_id,version,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(actor_id,entity_type,entity_id,version) DO NOTHING',[crypto.randomUUID(),actor.id,type,eid,changed.version,now.toISOString()]);}
    return{id:op.id,state:'accepted',version:changed.version};
   });await tx.query('RELEASE SAVEPOINT sync_op');results.push(result);
  }catch(e){await tx.query('ROLLBACK TO SAVEPOINT sync_op');await tx.query('RELEASE SAVEPOINT sync_op');if(e instanceof z.ZodError||e instanceof HttpError&&e.statusCode<500||(e as any)?.code==='23505'){results.push({id:op.id,state:'failed',message:e instanceof z.ZodError?'El registro no cumple el contrato.':e instanceof HttpError?e.message:'Identificador no disponible. Creá un nuevo registro.'});}else throw e;}}
  return{results};
 });
}
export async function pull(db:Database,actor:Actor,cursor:string){need(/^\d{1,18}$/.test(cursor),'Cursor inválido.');return asActor(db,actor,async tx=>{const rows=(await tx.query<Entity&{cursor:string;entity_id:string}>(`SELECT * FROM changes WHERE actor_id=$1 AND cursor>$2::bigint ORDER BY cursor LIMIT 201`,[actor.id,cursor])).rows;const data=rows.slice(0,200);return{changes:data.map(e=>({...changeOf({...e,id:e.entity_id}),cursor:undefined})),cursor:data.length?String(data[data.length-1].cursor):cursor,more:rows.length>200}})}
