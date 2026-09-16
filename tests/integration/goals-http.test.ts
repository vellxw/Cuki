import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncService } from '../../packages/core/api';
import { goalAt, uid } from '../../packages/core/utils';
import { httpFixture } from '../support/http-fixture';
let fixture:Awaited<ReturnType<typeof httpFixture>>;
before(async()=>{fixture=await httpFixture()});
after(async()=>{await fixture?.close()});
const account=()=>fixture.account(),device=(id:string)=>fixture.device(id);

test('two-device goal edits keep operation chronology when an older offline goal arrives last', async () => {
  const owner = await account();
  const a = (await device(owner.identity.userId)).repo, b = (await device(owner.identity.userId)).repo;
  const date = a.getSnapshot().selectedDate;
  const base = { version: 1, effectiveFrom: date, energy: 2000, protein: 100, carbs: null, fat: null };
  const older = { ...base, id: uid() }, newer = { ...base, id: uid(), energy: 2300 };
  const early = new Date(Date.now() - 20000).toISOString(), late = new Date(Date.now() - 10000).toISOString();
  await a.dispatchMany([{ type: 'goal', goal: older }], uid(), early);
  await b.dispatchMany([{ type: 'goal', goal: newer }], uid(), late);
  // A remains offline while B reaches the real HTTP server first.
  await new SyncService(owner.api, b).sync();
  await new SyncService(owner.api, a).sync();
  await new SyncService(owner.api, b).sync();
  assert.equal(goalAt(a.getSnapshot(), date)?.id, newer.id);
  assert.equal(goalAt(b.getSnapshot(), date)?.id, newer.id);
  assert.equal(a.getSnapshot().goals.find(g => g.id === older.id)?.updatedAt, early);
  const c = (await device(owner.identity.userId)).repo;
  await new SyncService(owner.api, c).sync();
  assert.equal(goalAt(c.getSnapshot(), date)?.energy, 2300);
  assert.equal(c.getSnapshot().goals.length, 2);
});
test('server derives goal timestamp from the validated operation instead of a forged payload', async () => {
  const owner = await account(), repo = (await device(owner.identity.userId)).repo;
  const at = new Date(Date.now() - 1000).toISOString(), id = uid();
  const response = await owner.api.request<{results:{state:string}[]}>('/v1/sync/push', 'POST', { operations: [{
    id: uid(), entityType: 'goal', entityId: id, baseVersion: 0, deleted: false, createdAt: at, state: 'pending',
    payload: { id, version: 1, effectiveFrom: repo.getSnapshot().selectedDate, energy: 2000, protein: null, carbs: null, fat: null, updatedAt: '2099-01-01T00:00:00.000Z' },
  }] });
  assert.equal(response.results[0].state, 'accepted');
  await new SyncService(owner.api, repo).sync();
  assert.equal(repo.getSnapshot().goals.find(g => g.id === id)?.updatedAt, at);
});
