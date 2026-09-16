import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VoiceCaptureSession,type VoicePort} from '../../packages/core/voice-capture';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{promise,resolve};}
function setup(overrides:Partial<VoicePort>={}){
 const log:string[]=[];const port:VoicePort={prepare:async()=>{log.push('prepare')},begin:max=>log.push('begin:'+max),finish:async()=>{log.push('finish');return'file:///private/voice.m4a'},save:async uri=>{log.push('save:'+uri)},abandon:async uri=>{log.push('abandon:'+uri)},...overrides};
 return{session:new VoiceCaptureSession(port),log};
}
test('creating the voice UI/session never requests microphone access or uploads automatically',()=>{
 const {session,log}=setup();assert.equal(session.getSnapshot().phase,'idle');assert.deepEqual(log,[]);session.dispose();
});
test('explicit start has a native duration bound and explicit stop saves before declaring review',async()=>{
 const saved=deferred<void>();const{session,log}=setup({save:()=>saved.promise});await session.start();assert.deepEqual(log,['prepare','begin:120']);
 const stopping=session.stop();assert.equal(session.getSnapshot().phase,'stopping');saved.resolve();await stopping;assert.equal(session.getSnapshot().phase,'review');session.dispose();
});
test('two rapid start presses and repeated stops never start or save two recordings',async()=>{
 const ready=deferred<void>();let prepares=0;const {session,log}=setup({prepare:()=>{prepares++;return ready.promise}});
 const first=session.start();void session.start();ready.resolve();await first;await Promise.all([session.stop(),session.stop()]);
 assert.equal(prepares,1);assert.equal(log.filter(x=>x.startsWith('begin')).length,1);assert.equal(log.filter(x=>x.startsWith('save')).length,1);session.dispose();
});
test('leaving while native permission is pending cannot start a hidden microphone later',async()=>{
 const ready=deferred<void>();const{session,log}=setup({prepare:()=>ready.promise});const first=session.start();session.dispose();ready.resolve();await first;
 assert.ok(!log.some(x=>x.startsWith('begin')));assert.ok(!log.some(x=>x.startsWith('save')));assert.ok(log.includes('abandon:file:///private/voice.m4a'));
});
test('background or cancellation during preparation produces no recorded meal',async()=>{
 const ready=deferred<void>();const{session,log}=setup({prepare:()=>ready.promise});void session.start();const stopped=session.stop();ready.resolve();await stopped;
 assert.equal(session.getSnapshot().phase,'idle');assert.ok(!log.some(x=>x.startsWith('begin')||x.startsWith('save')));session.dispose();
});
test('permission denial preserves an explicit error and text fallback instead of pretending success',async()=>{
 const {session,log}=setup({prepare:async()=>{throw Error('Micrófono no autorizado')}});await session.start();assert.equal(session.getSnapshot().phase,'error');assert.match(session.getSnapshot().error!,/no autorizado/);assert.deepEqual(log,[]);session.dispose();
});
test('durability failure is not reported as a saved recording',async()=>{
 const {session}=setup({save:async()=>{throw Error('Almacenamiento lleno')}});await session.start();await session.stop();assert.equal(session.getSnapshot().phase,'error');assert.match(session.getSnapshot().error!,/Almacenamiento/);session.dispose();
});
test('the duration deadline stops the native recorder and persists its result, not a fake transcript',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {session,log}=setup();await session.start();t.mock.timers.tick(120000);
 await session.stop();assert.equal(session.getSnapshot().phase,'review');assert.equal(log.filter(x=>x==='finish').length,1);session.dispose();t.mock.timers.reset();
});
