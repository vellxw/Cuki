import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionManager,type SessionStorage} from '../../packages/core/session-manager';
import {SyncCoordinator,type SyncClock} from '../../packages/core/sync-coordinator';
import {PersistentDraft} from '../../packages/core/draft';
import {ClientRepo} from '../../packages/core/repository';
import {sqlite} from '../support/sqlite';
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};}
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const config={endpoint:'https://identity.example.invalid',publicKey:'test-public-key'};
const fixture=(id='alice',expires=20000)=>({access_token:'fixture-access-'+id,refresh_token:'fixture-refresh-'+id,expires_at:expires,user:{id,email:id+'@example.invalid',email_confirmed_at:'2026-01-01'}});
const response=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
function disk(initial:string|null=null){let stored=initial;return{read:async()=>stored,write:async(value:string)=>{stored=value;},remove:async()=>{stored=null;},get:()=>stored} satisfies SessionStorage&{get():string|null};}
test('identity becomes visible only after secure persistence succeeds',async()=>{
 const store=disk(),pending=deferred<void>();const manager=new SessionManager({...store,async write(value){await pending.promise;await store.write(value);}},config,async()=>response(fixture()),()=>1000);
 const login=manager.signIn('a','p');await drain();assert.equal(manager.identity(),null);pending.resolve();assert.equal((await login).userId,'alice');assert.equal(JSON.parse(store.get()!).user.id,'alice');
});
test('logout while secure write is pending cannot resurrect a session on next launch',async()=>{
 const store=disk(),pending=deferred<void>();const manager=new SessionManager({...store,async write(value){await pending.promise;await store.write(value);}},config,async()=>response(fixture()),()=>1000);
 const login=manager.signIn('a','p'),failure=assert.rejects(login,/cuenta cambió/);await drain();const logout=manager.logout();pending.resolve();await logout;await failure;assert.equal(store.get(),null);assert.equal(await new SessionManager(store,config).restore(),null);
});
test('latest login wins regardless of network response order',async()=>{
 const a=deferred<Response>(),b=deferred<Response>(),store=disk();let calls=0;const manager=new SessionManager(store,config,()=>++calls===1?a.promise:b.promise,()=>1000);
 const first=manager.signIn('a','p'),failure=assert.rejects(first,/cuenta cambió/);const second=manager.signIn('b','p');b.resolve(response(fixture('bob')));await second;a.resolve(response(fixture()));await failure;assert.equal(manager.identity()?.userId,'bob');assert.equal(JSON.parse(store.get()!).user.id,'bob');
});
test('failed secure storage does not falsely complete authentication',async()=>{
 const store=disk(),manager=new SessionManager({...store,async write(){throw new Error('storage unavailable');}},config,async()=>response(fixture()),()=>1000);
 await assert.rejects(manager.signIn('a','p'),/storage unavailable/);assert.equal(manager.identity(),null);assert.equal(store.get(),null);
});
test('concurrent refresh requests share one request without invalidating same-account epoch',async()=>{
 const store=disk(JSON.stringify(fixture('alice',1))),pending=deferred<Response>();let calls=0;const manager=new SessionManager(store,config,()=>{calls++;return pending.promise;},()=>10000);await manager.restore();const epoch=manager.epoch();
 const tokens=[manager.accessToken(),manager.accessToken()];await drain();assert.equal(calls,1);pending.resolve(response({...fixture(),access_token:'rotated'}));assert.deepEqual(await Promise.all(tokens),['rotated','rotated']);assert.equal(manager.epoch(),epoch);
});
test('refresh after logout cannot expose or persist old credentials',async()=>{
 const store=disk(JSON.stringify(fixture('alice',1))),pending=deferred<Response>();const manager=new SessionManager(store,config,()=>pending.promise,()=>10000);await manager.restore();const token=manager.accessToken(),failure=assert.rejects(token,/cuenta cambió/);await drain();await manager.logout();pending.resolve(response(fixture()));await failure;assert.equal(store.get(),null);assert.equal(manager.identity(),null);
});
test('wrong-account refresh is rejected before write',async()=>{
 const store=disk(JSON.stringify(fixture('alice',1))),manager=new SessionManager(store,config,async()=>response(fixture('bob')),()=>10000);await manager.restore();await assert.rejects(manager.accessToken(),/cuenta cambió/);assert.equal(JSON.parse(store.get()!).user.id,'alice');
});
test('corrupt stored credentials are removed instead of restoring arbitrary state',async()=>{
 for(const value of ['{bad',JSON.stringify({...fixture(),expires_at:null})]){const store=disk(value),manager=new SessionManager(store,config);assert.equal(await manager.restore(),null);assert.equal(store.get(),null);}
});
class Clock implements SyncClock{
 value=1000;id=0;queue=new Map<number,{at:number;fn:()=>void}>();now=()=>this.value;
 setTimeout=(fn:()=>void,ms:number)=>{const id=++this.id;this.queue.set(id,{at:this.value+ms,fn});return id;};
 clearTimeout=(id:unknown)=>{this.queue.delete(id as number);};
 async tick(ms=0){this.value+=ms;for(const[id,item]of [...this.queue])if(item.at<=this.value){this.queue.delete(id);item.fn();}await drain();}
}
function source(){let state={outbox:[] as {id:string;state:string}[]};const listeners=new Set<()=>void>();return{getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},set:(items:typeof state.outbox)=>{state={outbox:items};listeners.forEach(fn=>fn());}};}
test('sync resumes on connectivity and preserves local operations until success',async()=>{
 const clock=new Clock(),s=source();s.set([{id:'pending-1',state:'pending'}]);let calls=0;const sync=new SyncCoordinator(s,async()=>{calls++;s.set([]);},{clock});sync.setOnline(false);sync.start();await clock.tick();assert.equal(calls,0);assert.equal(sync.getSnapshot().pending,1);sync.setOnline(true);await clock.tick();assert.equal(calls,1);assert.equal(sync.getSnapshot().pending,0);sync.stop();
});
test('transient sync errors retry after backoff, not a tight loop',async()=>{
 const clock=new Clock(),s=source();let calls=0;const sync=new SyncCoordinator(s,async()=>{if(++calls===1)throw new Error('offline');},{clock,retries:[1000]});sync.start();await clock.tick();assert.equal(sync.getSnapshot().phase,'retrying');await clock.tick(999);assert.equal(calls,1);await clock.tick(1);assert.equal(calls,2);assert.equal(sync.getSnapshot().phase,'idle');sync.stop();
});
test('permission failures block automatic retries; explicit retry remains possible',async()=>{
 const clock=new Clock(),s=source();let calls=0;const sync=new SyncCoordinator(s,async()=>{calls++;throw Object.assign(new Error('login required'),{status:401});},{clock});sync.start();await clock.tick();assert.equal(sync.getSnapshot().phase,'blocked');await clock.tick(600000);assert.equal(calls,1);sync.requestNow();await clock.tick();assert.equal(calls,2);sync.stop();
});
test('stopping foreground sync aborts an in-flight request and cancels timers',async()=>{
 const clock=new Clock(),s=source(),pending=deferred<void>();let signal:AbortSignal|undefined;const sync=new SyncCoordinator(s,async value=>{signal=value;await pending.promise;},{clock});sync.start();await clock.tick();sync.stop();assert.equal(signal?.aborted,true);pending.resolve();await drain();assert.equal(clock.queue.size,0);
});
test('drafts isolate account and screen key, and survive unsubscribing/reopening',async()=>{
 const db=sqlite();try{const a=await new ClientRepo(db.driver,'alice','UTC').init(),b=await new ClientRepo(db.driver,'bob','UTC').init();const first=new PersistentDraft(a,'recipe:one',()=>({title:''})),other=new PersistentDraft(a,'recipe:two',()=>({title:''}));const off=first.subscribe(()=>{});first.set({title:'Avena'});off();await first.flush();assert.equal(other.getSnapshot().value.title,'');assert.equal(new PersistentDraft(b,'recipe:one',()=>({title:''})).getSnapshot().value.title,'');const reopened=await new ClientRepo(db.driver,'alice','UTC').init();assert.equal(new PersistentDraft(reopened,'recipe:one',()=>({title:''})).getSnapshot().value.title,'Avena');}finally{db.close();}
});
