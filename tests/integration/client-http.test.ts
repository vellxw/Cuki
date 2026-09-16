import {searchFoods,findBarcode} from '../../packages/core/catalog-client';
import {requestPrivacyOperation} from '../../packages/core/privacy-client';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../apps/api/src/app';
import { configuration } from '../../packages/server/config';
import { embedded, migrate, type Database } from '../../packages/server/db';
import { ClientRepo } from '../../packages/core/repository';
import { ApiClient, CloudService, SyncService } from '../../packages/core/api';
import { SessionManager } from '../../packages/core/session-manager';
import { createSession } from '../../packages/core/state';
import { entryFromFood, entryFromRecipe, scaleNutrients, uid } from '../../packages/core/utils';
import { sqlite } from '../support/sqlite';

// These exercise the real client repository through a listening HTTP server and SQL,
// not Fastify.inject or a mocked fetch. Secure storage remains a test port, not Keychain.
let service: Awaited<ReturnType<typeof createApp>>;
let db: Database, folder: string, origin: string;
const emails = new Set<string>();
const clients: ReturnType<typeof sqlite>[] = [];
before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'cuki-client-http-'));
  db = await embedded();
  await migrate(db);
  const config = configuration({ APP_ENV: 'test', PUBLIC_ORIGIN: 'http://127.0.0.1:0',
    LOCAL_AUTH_SECRET: randomBytes(48).toString('hex'), MEDIA_SIGNING_SECRET: randomBytes(48).toString('hex'), MEDIA_DIR: folder });
  service = await createApp({ db, config });
  origin = await service.app.listen({ host: '127.0.0.1', port: 0 });
  config.origin = origin; config.authIssuer = origin + '/auth/v1';
});
after(async () => {
  for (const client of clients) client.close();
  await service?.app.close(); await db?.close();
  await rm(folder, { recursive: true, force: true });
  for (const filename of await readdir('.local/mail').catch(() => [])) {
    const path = join('.local/mail', filename);
    try { if (emails.has(JSON.parse(await readFile(path, 'utf8')).to)) await rm(path); } catch {}
  }
});
async function account() {
  let stored: string | null = null;
  const session = new SessionManager({ read: async () => stored, write: async value => { stored = value; }, remove: async () => { stored = null; } },
    { endpoint: origin, publicKey: 'local-development-not-a-secret' });
  const email = uid() + '@client-tests.invalid'; emails.add(email);
  assert.equal(await session.signUp(email, 'Test-only-password-219384'), null);
  let code = '';
  for (const filename of await readdir('.local/mail')) {
    const value = JSON.parse(await readFile(join('.local/mail', filename), 'utf8'));
    if (value.to === email) code = value.token;
  }
  assert.match(code, /^\d{6}$/);
  const identity = await session.verifyOtp(email, code);
  assert.equal(identity.verified, true);
  const api = new ApiClient(origin, session.accessToken, session.epoch);
  return { session, identity, api };
}
async function device(actor: string) {
  const disk = sqlite(join(folder, uid() + '.sqlite')); clients.push(disk);
  const repo = await new ClientRepo(disk.driver, actor, 'UTC').init();
  return { disk, repo };
}
test('administration HTML and its linked resources are served from the committed tree', async () => {
  const page = await fetch(origin + '/admin');
  assert.equal(page.status, 200, await page.clone().text());
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  const html = await page.text(); assert.match(html, /ACCESO RESTRINGIDO/);
  for (const path of ['/admin/app.js', '/admin/style.css']) {
    const response = await fetch(origin + path); assert.equal(response.status, 200, path);
    assert.ok((await response.text()).length > 100);
  }
  assert.equal((await fetch(origin + '/v1/admin/overview')).status, 401);
});
test('guest food and recipe snapshots merge once then reach a second device over actual HTTP', async () => {
  const { identity, api } = await account();
  const guest = (await device('guest')).repo;
  const state = guest.getSnapshot(), date = state.selectedDate;
  const food = entryFromFood(state.foods[0], 150, date, 'lunch', 'UTC');
  const recipe = entryFromRecipe(state.recipes[0], state.foods, .5, date, 'dinner', 'UTC');
  await guest.dispatchMany([{ type: 'profile', profile: { name: 'HTTP fixture', onboarded: true } }, { type: 'entry', entry: food }, { type: 'entry', entry: recipe }]);
  const { repo: a, disk } = await device(identity.userId);
  await a.mergeGuest(guest.getSnapshot()); await a.mergeGuest(guest.getSnapshot());
  assert.equal(a.getSnapshot().diary.length, 2);
  await new SyncService(api, a).sync(); assert.deepEqual(a.getSnapshot().outbox, []);
  const b = (await device(identity.userId)).repo;
  await new SyncService(api, b).sync();
  assert.deepEqual(b.getSnapshot().diary.map(x => x.id).sort(), [food.id, recipe.id].sort());
  assert.deepEqual(b.getSnapshot().diary.find(x => x.id === recipe.id)?.nutrition, recipe.nutrition);
  const reopened = await new ClientRepo(disk.driver, identity.userId, 'UTC').init();
  assert.equal(reopened.getSnapshot().diary.length, 2);
  const stranger = await account();
  const unrelated = (await device(stranger.identity.userId)).repo;
  await new SyncService(stranger.api, unrelated).sync(); assert.equal(unrelated.getSnapshot().diary.length, 0);
});
test('two-device conflict can be reviewed and retried, with edit, tombstone and undo retained', async () => {
  const { identity, api } = await account();
  const a = (await device(identity.userId)).repo, b = (await device(identity.userId)).repo;
  const syncA = new SyncService(api, a), syncB = new SyncService(api, b);
  const entry = entryFromFood(a.getSnapshot().foods[0], 100, a.getSnapshot().selectedDate, 'lunch', 'UTC');
  await a.dispatch({ type: 'entry', entry }); await syncA.sync(); await syncB.sync();
  await a.dispatch({ type: 'entry', entry: { ...a.getSnapshot().diary[0], version: 2, amount: 200, nutrition: scaleNutrients(entry.nutrition, 2) } });
  await b.dispatch({ type: 'entry', entry: { ...b.getSnapshot().diary[0], version: 2, amount: 150, nutrition: scaleNutrients(entry.nutrition, 1.5) } });
  await syncA.sync(); await syncB.sync();
  const conflict = b.getSnapshot().outbox.find(x => x.state === 'conflict'); assert.ok(conflict);
  assert.equal(b.getSnapshot().diary[0].amount, 150);
  await b.resolveConflict(conflict.id, true); await syncB.sync(); await syncA.sync();
  assert.equal(a.getSnapshot().diary[0].amount, 150); assert.equal(a.getSnapshot().diary[0].version, 3);
  await a.dispatch({ type: 'deleteEntry', id: entry.id }); await syncA.sync(); await syncB.sync();
  assert.ok(b.getSnapshot().diary[0].deletedAt);
  await b.dispatch({ type: 'restoreEntry', id: entry.id }); await syncB.sync(); await syncA.sync();
  assert.equal(a.getSnapshot().diary[0].deletedAt, null); assert.equal(a.getSnapshot().diary[0].version, 5);
});
test('completed workout survives restart and sync with its individual sets and garden credit', async () => {
  const { identity, api } = await account();
  const { repo: a, disk } = await device(identity.userId);
  const cloud = new CloudService(api, a, async () => { throw Error('No upload in this test'); });
  await cloud.enroll(uid());
  const session = createSession(a.getSnapshot(), undefined, 0, [a.getSnapshot().exercises[0].id]);
  await a.dispatch({ type: 'startSession', session });
  const ex = a.getSnapshot().sessions[0].exercises[0];
  // An automatic network acknowledgement can arrive while the user edits this
  // captured form baseline. It must not create a spurious stale-series conflict.
  await new SyncService(api, a).sync();
  assert.deepEqual(a.getSnapshot().outbox, []);
  await a.dispatch({ type: 'set', sessionId: session.id, exerciseId: ex.id, set: { ...ex.sets[0], load: 20, reps: 8 }, complete: true });
  const rest = a.getSnapshot().sessions[0].restDeadline; assert.ok(rest);
  const reopened = await new ClientRepo(disk.driver, identity.userId, 'UTC').init();
  assert.equal(reopened.getSnapshot().sessions[0].restDeadline, rest);
  await reopened.dispatch({ type: 'finishSession', id: session.id, note: 'Sesión de prueba HTTP' });
  await new SyncService(api, reopened).sync(); assert.deepEqual(reopened.getSnapshot().outbox, []);
  const b = (await device(identity.userId)).repo; await new SyncService(api, b).sync();
  const result = b.getSnapshot().sessions[0];
  assert.equal(result.status, 'completed'); assert.equal(result.exercises[0].sets[0].reps, 8);
  assert.ok(result.exercises[0].sets[0].completedAt); assert.equal(result.note, 'Sesión de prueba HTTP');
  const garden = await cloud.refreshGarden(); assert.equal(garden?.creditedWeeks, 1);
  assert.equal(garden?.state, 'active'); assert.equal((await cloud.wallet()).length, 0);
});
test('nonprivileged account cannot read administrative queues or bypass a missing provider', async () => {
  const { api } = await account();
  await assert.rejects(() => api.request('/v1/admin/overview'), (e: any) => e.status === 403);
  await assert.rejects(() => api.request('/v1/ai/jobs', 'POST', { route: 'text', input: 'pollo', mediaId: null }, uid()), (e: any) => e.status === 503);
});
test('real food search and barcode contracts return and cache the right market, not empty wrappers', async () => {
  const owner = await account(), stranger = await account();
  const a = (await device(owner.identity.userId)).repo;
  const source = a.getSnapshot().foods[0];
  const product = {...source, id:uid(), name:'Producto exclusivo de pruebas HTTP', gtin:'4006381333931', market:'AR', state:'private' as const, ownerId:owner.identity.userId};
  await a.dispatch({type:'food',food:product}); await new SyncService(owner.api,a).sync();
  const b = (await device(owner.identity.userId)).repo;
  const found = await findBarcode(owner.api,b,product.gtin,'AR'); assert.equal(found?.id,product.id);
  assert.equal(b.getSnapshot().foods.find(f=>f.id===product.id)?.gtin,product.gtin);
  assert.equal(await findBarcode(owner.api,b,product.gtin,'FR'),null);
  assert.equal((await searchFoods(owner.api,b,'Producto exclusivo'))[0].id,product.id);
  assert.equal(await findBarcode(stranger.api,(await device(stranger.identity.userId)).repo,product.gtin),null);
  assert.equal(await findBarcode(owner.api,b,'5901234123457'),null);
});
test('source version route preserves owner history while not exposing private versions to strangers', async () => {
  const owner=await account(), stranger=await account(), repo=(await device(owner.identity.userId)).repo;
  const source={...repo.getSnapshot().foods[0],id:uid(),name:'Versiones de prueba',state:'private' as const,ownerId:owner.identity.userId};
  await repo.dispatch({type:'food',food:source}); await new SyncService(owner.api,repo).sync();
  await repo.dispatch({type:'food',food:{...source,version:2,name:'Versión corregida',updatedAt:new Date().toISOString()}});
  await new SyncService(owner.api,repo).sync();
  const versions=await owner.api.request<any[]>('/v1/foods/'+source.id+'/versions');
  assert.deepEqual(versions.map(v=>v.version),[2,1]); assert.equal(versions[1].name,'Versiones de prueba');
  await assert.rejects(()=>stranger.api.request('/v1/foods/'+source.id+'/versions'),(e:any)=>e.status===404);
});
test('privacy client sends durable idempotency keys and retries a lost acknowledgement exactly once', async () => {
  const owner=await account(), repo=(await device(owner.identity.userId)).repo;
  const realRequest=owner.api.request.bind(owner.api);let cutResponse=true;
  owner.api.request=async function<T>(...args:Parameters<typeof realRequest>):Promise<T>{
    const result=await realRequest<T>(...args);
    if(cutResponse&&args[0]==='/v1/privacy/export'){cutResponse=false;throw Error('Test connection lost after server commit');}
    return result;
  };
  await assert.rejects(()=>requestPrivacyOperation(owner.api,repo,'export'),/connection lost/);
  const result=await requestPrivacyOperation(owner.api,repo,'export'); assert.equal(result.state,'queued');
  const jobs=await owner.api.request<any[]>('/v1/privacy/exports'); assert.equal(jobs.length,1);assert.equal(jobs[0].id,result.id);
  await service.privacy.processOne();
  const fresh=await requestPrivacyOperation(owner.api,repo,'export');assert.notEqual(fresh.id,result.id);
  const deletion=await requestPrivacyOperation(owner.api,repo,'delete');assert.equal(deletion.state,'queued');
  assert.equal((await requestPrivacyOperation(owner.api,repo,'delete')).id,deletion.id);
});
