import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVisualState} from '../../packages/testing/visual-fixtures';
import {gardenSummary} from '../../packages/core/garden-summary';
import {createSession} from '../../packages/core/state';
import {dockSectionForScreen} from '../../packages/core/navigation';
test('missing comparable history is unknown, not a fabricated strength improvement',()=>{
 const {state}=createVisualState('garden');const sum=gardenSummary(state);assert.equal(sum.comparableLoadChange,null);assert.equal(sum.creditedWeeks,38);assert.equal(sum.recordedSessions,0);
});
test('only the same exercise, load convention and repetition count produce a descriptive load comparison',()=>{
 const {state}=createVisualState('garden');const make=(date:string,load:number,reps=8,mode='external_total')=>{
  const s=createSession(state,undefined,0,['incline-machine'],date);s.status='completed';s.endedAt=date;s.exercises[0].sets[0]={...s.exercises[0].sets[0],load,reps,loadMode:mode as any,completedAt:date};return s;
 };
 state.sessions=[make('2026-09-10T12:00:00Z',40),make('2026-09-11T12:00:00Z',50),make('2026-09-12T12:00:00Z',90,12),make('2026-09-13T12:00:00Z',150,8,'assisted')];
 const sum=gardenSummary(state);assert.equal(sum.comparableLoadChange,25);assert.deepEqual(sum.comparableLoads,[40,50]);assert.equal(sum.recordedSessions,4);
});
test('past sessions and future timestamps do not inflate current-cycle frequency',()=>{
 const {state}=createVisualState('garden');const s=createSession(state,undefined,0,['incline-machine'],'2024-01-01T00:00:00Z');s.status='completed';s.endedAt=s.startedAt;s.exercises[0].sets[0]={...s.exercises[0].sets[0],load:40,reps:8,completedAt:s.startedAt};state.sessions=[s,{...s,id:'future',endedAt:'2030-01-01T00:00:00Z'}];assert.equal(gardenSummary(state).recordedSessions,0);assert.equal(gardenSummary(state).comparableLoadChange,null);
});
test('one detail shell supplies reference navigation; capture, editors and celebration remain unobscured',()=>{
 for(const id of ['SC-20','SC-26','SC-47','SC-79'])assert.notEqual(dockSectionForScreen(id),null);
 for(const id of ['SC-01','SC-18','SC-32','SC-44','SC-85','SC-07','SC-23'])assert.equal(dockSectionForScreen(id),null);
});
