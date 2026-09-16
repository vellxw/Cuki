import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,createSession,reduceCommand} from '../../packages/core/state';
import {acceptsSetRevision,sameSetContents} from '../../packages/core/set-revisions';
const now='2026-09-16T12:00:00Z';
function active(){let state=initialState('user-a','UTC',now);const session=createSession(state,undefined,0,[state.exercises[0].id],now);state=reduceCommand(state,{type:'startSession',session},now);return{state,session:state.sessions[0],exercise:state.sessions[0].exercises[0],set:state.sessions[0].exercises[0].sets[0]};}
test('new session sets start at the same revision which the first server acknowledgement confirms',()=>{
 const {state,set}=active();assert.equal(set.version,1);const op=state.outbox.find(x=>x.entityType==='set')!;assert.equal(op.baseVersion,0);assert.equal((op.payload as any).version,1);
});
test('transport-only revision normalization safely accepts an unchanged captured baseline',()=>{
 const {state,session,exercise,set}=active();exercise.sets[0]={...set,version:2};
 const result=reduceCommand(state,{type:'set',sessionId:session.id,exerciseId:exercise.id,set:{...set,load:22,reps:8},baseSet:set,complete:true},now);
 assert.equal(result.sessions[0].exercises[0].sets[0].load,22);assert.equal(result.sessions[0].exercises[0].sets[0].version,3);assert.ok(result.sessions[0].restDeadline);
});
test('actual concurrent set edits are still rejected instead of overwriting another device',()=>{
 const {state,session,exercise,set}=active();exercise.sets[0]={...set,version:2,load:30};
 assert.throws(()=>reduceCommand(state,{type:'set',sessionId:session.id,exerciseId:exercise.id,set:{...set,load:22,reps:8},baseSet:set,complete:true},now),/otra edición/);
 assert.equal(exercise.sets[0].load,30);
});
test('an acknowledgement without a captured baseline cannot silently rebase a stale draft',()=>{
 const {set}=active();assert.equal(acceptsSetRevision({...set,version:2},set),false);
});
test('every editable field including completion and load convention participates in baseline equality',()=>{
 const {set}=active();for(const patch of [{kind:'warmup'},{loadMode:'assisted'},{load:2},{reps:9},{seconds:20},{meters:10},{rir:1},{note:'other'},{completedAt:now}])assert.equal(sameSetContents(set,{...set,...patch} as typeof set),false,JSON.stringify(patch));
 assert.equal(sameSetContents(set,{...set,version:50}),true);
});
test('a deleted set cannot be recreated by a stale pending completion',()=>{
 const {state,session,exercise,set}=active();exercise.sets=[];
 assert.throws(()=>reduceCommand(state,{type:'set',sessionId:session.id,exerciseId:exercise.id,set:{...set,load:22,reps:8},baseSet:set,complete:true},now),/eliminada/);
});
