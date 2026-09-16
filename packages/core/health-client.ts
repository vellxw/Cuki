import {z} from 'zod';
import type {ClientRepo} from './repository';
import type {AppState, Measurement} from './types';
import {reduceCommand} from './state';
import {invariant,localDate,stableJSON,uid,sessionQualifies} from './utils';

export interface HealthPermissions {readWeight:boolean;readWorkout:boolean;writeWorkout:boolean}
export type HealthPermissionStatus='granted'|'denied'|'not_requested'|'not_disclosed';
export interface HealthAuthorization {requestCompleted:boolean;readWeight:HealthPermissionStatus;readWorkout:HealthPermissionStatus;writeWorkout:HealthPermissionStatus}
export const healthRecordSchema=z.object({provider:z.enum(['healthkit','health_connect']),externalId:z.string().min(1).max(500),
 source:z.string().min(1).max(500),kind:z.enum(['weight','workout']),date:z.string().datetime({offset:true}),
 value:z.number().finite().nonnegative(),unit:z.enum(['kg','seconds']),startAt:z.string().datetime({offset:true}).optional(),
 endAt:z.string().datetime({offset:true}).optional(),modifiedAt:z.string().datetime({offset:true}).optional(),title:z.string().max(500).optional()})
 .refine(r=>r.kind==='weight'?r.unit==='kg'&&r.value>0&&r.value<=1000:r.unit==='seconds');
export type HealthRecord=z.infer<typeof healthRecordSchema>;
export interface HealthReadResult {records:HealthRecord[];truncated:boolean;readAccess:'explicit'|'not_disclosed'}
export interface HealthWorkout {id:string;version:number;startAt:string;endAt:string;name:string;pausedSeconds:number;activity:'strength'|'other'}
export interface HealthWriter {requestPermissions(options:HealthPermissions):Promise<HealthAuthorization>;writeWorkout(value:HealthWorkout):Promise<{confirmed:boolean;externalId:string}>}
type ImportMarker={id:string;value:number;date:string;fingerprint:string};
export interface HealthImportSummary {inserted:number;updated:number;unchanged:number;conflicts:number;ignoredActivities:number}
/** Import is explicit. Missing samples never mean deletion or prove that permission was denied.
 * The source marker and the measurement/outbox write commit in the SAME SQLite transaction. */
export async function importHealthWeights(repo:ClientRepo,unknownRecords:unknown[],digest:(value:string)=>Promise<string>,isCurrent:()=>boolean=()=>true):Promise<HealthImportSummary>{
 invariant(isCurrent(),"La cuenta cambió; no se importaron datos de salud.");
 invariant(unknownRecords.length<=5000,'Demasiados registros: elegí un rango más pequeño.');
 const records=z.array(healthRecordSchema).parse(unknownRecords);
 const prepared=await Promise.all(records.filter(r=>r.kind==='weight').map(async record=>{
  const hash=await digest(stableJSON([record.provider,record.source,record.externalId]));
  invariant(/^[a-f0-9]{64}$/.test(hash),'La identidad de la fuente no pudo verificarse.');
  return {record,key:'health:import:'+hash,id:'health-'+hash};
 }));
 const summary:HealthImportSummary={inserted:0,updated:0,unchanged:0,conflicts:0,ignoredActivities:records.filter(r=>r.kind==='workout').length};
 const now=new Date().toISOString();
 await repo.mutate(state=>{
  invariant(isCurrent(),"La cuenta cambió; no se importaron datos de salud.");
  let next:AppState=state;
  for(const item of prepared){
   const date=localDate(new Date(item.record.date),next.profile.timezone);
   const fingerprint=stableJSON({value:item.record.value,date,modifiedAt:item.record.modifiedAt??null});
   let marker:ImportMarker|null=null;
   try{marker=next.requestKeys[item.key]?JSON.parse(next.requestKeys[item.key]):null}catch{}
   const existing=next.measurements.find(m=>m.id===item.id);
   if(marker?.fingerprint===fingerprint){summary.unchanged++;continue;}
   // User corrections/deletions win. A reimport never silently brings back deleted data.
   if(marker&&(!existing||existing.value!==marker.value||existing.date!==marker.date)){summary.conflicts++;continue;}
   if(existing&&!marker){summary.conflicts++;continue;}
   const measurement:Measurement={id:item.id,date,kind:'weight',unit:'kg',value:item.record.value,
    provenance:{provider:item.record.provider,source:item.record.source,externalId:item.record.externalId,importedAt:now}};
   next=reduceCommand(next,{type:'measurement',measurement},now,uid());
   next.requestKeys[item.key]=JSON.stringify({id:item.id,value:measurement.value,date,fingerprint});
   if(existing)summary.updated++;else summary.inserted++;
  }
  Object.assign(state,next);
 });
 return summary;
}
export async function exportWorkoutToHealth(repo:ClientRepo,sessionId:string,bridge:HealthWriter,isCurrent:()=>boolean=()=>true){
 invariant(isCurrent(),"La cuenta cambió; no se exportó el entrenamiento.");
 const session=repo.getSnapshot().sessions.find(s=>s.id===sessionId);
 invariant(session&&sessionQualifies(session)&&session.endedAt,'Finalizá una sesión válida antes de exportarla.');
 const marker='health:export:'+session.id;
 const previous=repo.getSnapshot().requestKeys[marker];
 if(previous&&Number(previous)>=session.version)return{confirmed:true,alreadyExported:true};
 const permission=await bridge.requestPermissions({readWeight:false,readWorkout:false,writeWorkout:true});
 invariant(permission.writeWorkout==='granted','No se autorizó guardar entrenamientos. Tu sesión sigue en CUKI.');
 invariant(isCurrent(),"La cuenta cambió; no se exportó el entrenamiento.");
 const current=repo.getSnapshot().sessions.find(s=>s.id===session.id);
 invariant(current?.version===session.version,'La sesión cambió. Revisala antes de exportar.');
 const activity=session.exercises.every(item=>repo.getSnapshot().exercises.find(exercise=>exercise.id===item.exerciseId)?.modality==='strength')?'strength':'other';
 const result=await bridge.writeWorkout({activity,id:session.id,version:session.version,startAt:session.startedAt,endAt:session.endedAt,name:session.name,pausedSeconds:session.pausedSeconds});
 invariant(result.confirmed&&typeof result.externalId==='string'&&result.externalId.length>0,'La aplicación de salud no confirmó el registro. Podés reintentar sin duplicarlo.');
 await repo.mutate(s=>{s.requestKeys[marker]=String(Math.max(Number(s.requestKeys[marker])||0,session.version));});
 return{confirmed:true,alreadyExported:false};
}
