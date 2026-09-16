import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ClientRepo} from '../../packages/core/repository';
import {importHealthWeights,exportWorkoutToHealth,type HealthWriter,type HealthRecord} from '../../packages/core/health-client';
import {createSession} from '../../packages/core/state';
import {sqlite} from '../support/sqlite';
const hash=async(value:string)=>createHash('sha256').update(value).digest('hex');
const weight=(override:Partial<HealthRecord>={}):HealthRecord=>({provider:'healthkit',externalId:'test-source-1',source:'com.example.test-health',kind:'weight',date:'2026-09-15T01:00:00Z',value:80,unit:'kg',...override});
test('health import stores provenance and deduplication atomically across a SQLite reopen',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','America/Argentina/Buenos_Aires').init();
  const initial=await importHealthWeights(repo,[weight()],hash);assert.equal(initial.inserted,1);
  const current=repo.getSnapshot().measurements[0];assert.equal(current.date,'2026-09-14');assert.equal(current.provenance?.source,weight().source);
  const reopened=await new ClientRepo(sql.driver,'guest','UTC').init();
  assert.equal((await importHealthWeights(reopened,[weight()],hash)).unchanged,1);assert.equal(reopened.getSnapshot().measurements.length,1);
  assert.equal(reopened.getSnapshot().outbox.filter(x=>x.entityType==='measurement').length,1);
 }finally{sql.close()}
});
test('health sources with the same external identifier do not overwrite each other',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init();
  await importHealthWeights(repo,[weight(),weight({source:'another-app',value:81}),weight({provider:'health_connect',value:82})],hash);
  assert.equal(new Set(repo.getSnapshot().measurements.map(m=>m.id)).size,3);
 }finally{sql.close()}
});
test('new source value updates only an untouched import, never a manual correction or deletion',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init();
  await importHealthWeights(repo,[weight()],hash);
  assert.equal((await importHealthWeights(repo,[weight({value:81})],hash)).updated,1);
  const measurement=repo.getSnapshot().measurements[0];await repo.dispatch({type:'measurement',measurement:{...measurement,value:75}});
  assert.equal((await importHealthWeights(repo,[weight({value:82})],hash)).conflicts,1);assert.equal(repo.getSnapshot().measurements[0].value,75);
  await repo.dispatch({type:'deleteMeasurement',id:measurement.id});
  assert.equal((await importHealthWeights(repo,[weight({value:83})],hash)).conflicts,1);assert.equal(repo.getSnapshot().measurements.length,0);
 }finally{sql.close()}
});
test('empty or activity-only health results never delete measures or award training credit',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init();await importHealthWeights(repo,[weight()],hash);
  const before=repo.getSnapshot().measurements;
  await importHealthWeights(repo,[],hash);
  const result=await importHealthWeights(repo,[weight({kind:'workout',unit:'seconds',value:1800})],hash);
  assert.equal(result.ignoredActivities,1);assert.deepEqual(repo.getSnapshot().measurements,before);assert.equal(repo.getSnapshot().sessions.length,0);assert.equal(repo.getSnapshot().garden,null);
 }finally{sql.close()}
});
test('invalid health input causes no partial import and no operation marker',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init();
  await assert.rejects(()=>importHealthWeights(repo,[weight(),weight({value:NaN})],hash));
  assert.equal(repo.getSnapshot().measurements.length,0);assert.equal(Object.keys(repo.getSnapshot().requestKeys).length,0);
 }finally{sql.close()}
});
test('health data is separated by CUKI account even when the underlying device samples match',async()=>{
 const sql=sqlite();try{const a=await new ClientRepo(sql.driver,'alice','UTC').init(),b=await new ClientRepo(sql.driver,'bob','UTC').init();
  await importHealthWeights(a,[weight()],hash);assert.equal(b.getSnapshot().measurements.length,0);
  assert.equal((await importHealthWeights(b,[weight()],hash)).inserted,1);
 }finally{sql.close()}
});
async function completed(repo:ClientRepo){const s=createSession(repo.getSnapshot(),undefined,0,[repo.getSnapshot().exercises[0].id]);await repo.dispatch({type:'startSession',session:s});const ex=repo.getSnapshot().sessions[0].exercises[0];await repo.dispatch({type:'set',sessionId:s.id,exerciseId:ex.id,set:{...ex.sets[0],load:20,reps:8},complete:true});await repo.dispatch({type:'finishSession',id:s.id,note:''});return s.id;}
test('export marks a workout only after confirmed native save, and repeating it is idempotent',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init(),sid=await completed(repo);let calls=0;
  const bridge:HealthWriter={requestPermissions:async()=>({requestCompleted:true,readWeight:'not_requested',readWorkout:'not_requested',writeWorkout:'granted'}),writeWorkout:async r=>{calls++;assert.equal(r.id,sid);assert.ok(r.version>0);return{confirmed:true,externalId:'fixture-native-id'}}};
  assert.equal((await exportWorkoutToHealth(repo,sid,bridge)).alreadyExported,false);
  assert.equal((await exportWorkoutToHealth(repo,sid,bridge)).alreadyExported,true);assert.equal(calls,1);
 }finally{sql.close()}
});
test('denied writing cannot be reported as exported; existing CUKI workout remains intact',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init(),sid=await completed(repo);let called=false;
  const bridge:HealthWriter={requestPermissions:async()=>({requestCompleted:true,readWeight:'not_disclosed',readWorkout:'not_disclosed',writeWorkout:'denied'}),writeWorkout:async()=>{called=true;return{confirmed:true,externalId:''}}};
  await assert.rejects(()=>exportWorkoutToHealth(repo,sid,bridge),/No se autorizó/);assert.equal(called,false);assert.equal(repo.getSnapshot().sessions[0].status,'completed');assert.equal(repo.getSnapshot().requestKeys['health:export:'+sid],undefined);
 }finally{sql.close()}
});
test('failed native export leaves a safe retry with the same session identity and version',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init(),sid=await completed(repo);const ids:string[]=[];let first=true;
  const bridge:HealthWriter={requestPermissions:async()=>({requestCompleted:true,readWeight:'not_requested',readWorkout:'not_requested',writeWorkout:'granted'}),writeWorkout:async r=>{ids.push(r.id+':'+r.version);if(first){first=false;throw Error('Native interruption')}return{confirmed:true,externalId:'fixture-id'}}};
  await assert.rejects(()=>exportWorkoutToHealth(repo,sid,bridge),/Native interruption/);await exportWorkoutToHealth(repo,sid,bridge);assert.equal(ids[0],ids[1]);
 }finally{sql.close()}
});

test('a CUKI account change during the permission sheet prevents exporting the old account workout',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'alice','UTC').init(),sid=await completed(repo);let current=true,calls=0;
  const bridge:HealthWriter={requestPermissions:async()=>{current=false;return{requestCompleted:true,readWeight:'not_requested',readWorkout:'not_requested',writeWorkout:'granted'}},writeWorkout:async()=>{calls++;return{confirmed:true,externalId:'fixture'}}};
  await assert.rejects(()=>exportWorkoutToHealth(repo,sid,bridge,()=>current),/cuenta cambió/);assert.equal(calls,0);
 }finally{sql.close()}
});
test('an account change while preparing imported identities cannot save health data',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'alice','UTC').init();let current=true;
  await assert.rejects(()=>importHealthWeights(repo,[weight()],async value=>{current=false;return hash(value)},()=>current),/cuenta cambió/);
  assert.equal(repo.getSnapshot().measurements.length,0);assert.equal(repo.getSnapshot().outbox.length,0);
 }finally{sql.close()}
});
test('an empty native acknowledgement is not treated as a confirmed export',async()=>{
 const sql=sqlite();try{const repo=await new ClientRepo(sql.driver,'guest','UTC').init(),sid=await completed(repo);
  const bridge:HealthWriter={requestPermissions:async()=>({requestCompleted:true,readWeight:'not_requested',readWorkout:'not_requested',writeWorkout:'granted'}),writeWorkout:async()=>({confirmed:true,externalId:''})};
  await assert.rejects(()=>exportWorkoutToHealth(repo,sid,bridge),/no confirmó/);assert.equal(repo.getSnapshot().requestKeys['health:export:'+sid],undefined);
 }finally{sql.close()}
});
