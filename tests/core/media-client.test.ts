import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capturePurpose, reconcileJob, uploadOwnedMedia } from '../../packages/core/media-client';
import { ApiClient } from '../../packages/core/api';
import type { AIJob } from '../../packages/core/types';
const fixture = (state: AIJob['state']): AIJob => ({ id:'job-a',route:'photo',state,createdAt:'2026-01-01T00:00:00Z',input:'',mediaUri:'file:///own-photo.jpg',error:null,result:null,ingredients:[{id:'i',name:'Rice',foodId:'rice',amount:100,unit:'g',note:''}] });
test('capture purpose matches the accepted upload vocabulary instead of the old meal_photo alias',()=>{
 assert.equal(capturePurpose('photo'),'photo');assert.equal(capturePurpose('label'),'label');assert.equal(capturePurpose('voice'),'voice');assert.throws(()=>capturePurpose('text'));
});
test('successful first analysis populates ingredients while retaining its actual local photo',()=>{
 const remote={...fixture('review'),mediaUri:null};const local={...fixture('running'),ingredients:[]};
 const result=reconcileJob(remote,local);assert.equal(result.state,'review');assert.equal(result.ingredients[0].amount,100);assert.equal(result.mediaUri,local.mediaUri);
});
test('polling completed worker does not overwrite reviewed quantities or reopen a recorded job',()=>{
 for(const state of ['review','applied','cancelled'] as const){
  const local={...fixture(state),ingredients:[{...fixture(state).ingredients[0],amount:180}]};
  const result=reconcileJob({...fixture('review'),mediaUri:null},local);
  assert.equal(result.state,state);assert.equal(result.ingredients[0].amount,180);assert.equal(result.mediaUri,local.mediaUri);
 }
});
test('polling stale running result cannot demote a locally reviewed estimate',()=>{
 assert.equal(reconcileJob(fixture('running'),fixture('review')).state,'review');
 assert.throws(()=>reconcileJob({...fixture('review'),id:'other'},fixture('running')),/otra tarea/);
});
test('missing, oversized, changed and unsupported media are rejected before any remote request',async()=>{
 const api=new ApiClient('',async()=>null);
 for(const source of [{exists:false,size:10},{exists:true,size:0},{exists:true,size:12000001},{exists:true,size:10}]){
  await assert.rejects(uploadOwnedMedia(api,{...source,arrayBuffer:async()=>new ArrayBuffer(5)},'photo'));
 }
 await assert.rejects(uploadOwnedMedia(api,{exists:true,size:5,arrayBuffer:async()=>new ArrayBuffer(5)},'meal_photo'),/destino/);
});
