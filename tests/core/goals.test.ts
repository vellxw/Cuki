import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Goal } from '../../packages/core/types';
import { initialState, reduceCommand } from '../../packages/core/state';
import { goalAt, uid, entryFromFood } from '../../packages/core/utils';
import { ClientRepo } from '../../packages/core/repository';
import { entitySchemas } from '../../packages/contracts/entities';
import { sqlite } from '../support/sqlite';

const firstTime = '2026-09-16T09:00:00.000Z';
const secondTime = '2026-09-16T09:01:00.000Z';
const goal = (energy: number, date = '2026-09-16'): Goal => ({
  id: uid(), version: 1, effectiveFrom: date, energy, protein: 100, carbs: null, fat: null,
});

test('second manual save on the same effective day becomes the active goal', () => {
  let state = initialState('guest', 'UTC', firstTime);
  const first = goal(2000), second = goal(2200);
  state = reduceCommand(state, { type: 'goal', goal: first }, firstTime);
  state = reduceCommand(state, { type: 'goal', goal: second }, secondTime);
  assert.equal(goalAt(state)?.id, second.id);
  assert.equal(goalAt(state)?.energy, 2200);
  assert.equal(state.goals.length, 2, 'Keep prior goal revisions for history');
});
test('changing today does not rewrite previous days or existing food snapshots', () => {
  let state = initialState('guest', 'UTC', firstTime);
  const previous = goal(2000, '2026-09-15'), today = goal(2300);
  state = reduceCommand(state, { type: 'goal', goal: previous }, firstTime);
  const meal = entryFromFood(state.foods[0], 100, '2026-09-15', 'lunch', 'UTC');
  state = reduceCommand(state, { type: 'entry', entry: meal }, firstTime);
  state = reduceCommand(state, { type: 'goal', goal: today }, secondTime);
  assert.equal(goalAt(state, '2026-09-15')?.id, previous.id);
  assert.equal(goalAt(state, '2026-09-16')?.id, today.id);
  assert.deepEqual(state.diary[0], meal);
  assert.equal(goalAt(state, '2026-09-14'), null);
});
test('new goal remains selected after reloading the repository from actual SQLite', async () => {
  const sql = sqlite();
  try {
    const repo = await new ClientRepo(sql.driver, 'guest', 'UTC').init();
    const first = goal(2000), second = goal(2400);
    await repo.dispatchMany([{ type: 'goal', goal: first }], uid(), firstTime);
    await repo.dispatchMany([{ type: 'goal', goal: second }], uid(), secondTime);
    const reloaded = await new ClientRepo(sql.driver, 'guest', 'UTC').init();
    assert.equal(goalAt(reloaded.getSnapshot(), '2026-09-16')?.id, second.id);
  } finally { sql.close(); }
});

test('goal timestamps come from the command envelope and do not mutate the caller', () => {
 const supplied = { ...goal(2000), updatedAt: '2099-01-01T00:00:00.000Z' };
 const state = reduceCommand(initialState('guest', 'UTC', firstTime), { type: 'goal', goal: supplied }, firstTime);
 assert.equal(state.goals[0].updatedAt, firstTime);
 assert.equal(supplied.updatedAt, '2099-01-01T00:00:00.000Z');
});
test('legacy goals remain readable, and equal timestamps are independent of download order', () => {
 const legacy = { ...goal(1900), id: 'legacy', version: 20 };
 const a = { ...goal(2000), id: 'a', updatedAt: secondTime };
 const b = { ...goal(2100), id: 'b', updatedAt: secondTime };
 assert.equal(goalAt([legacy], '2026-09-16')?.id, legacy.id);
 assert.equal(goalAt([legacy, a], '2026-09-16')?.id, a.id);
 assert.equal(goalAt([a, b], '2026-09-16')?.id, goalAt([b, a], '2026-09-16')?.id);
 assert.deepEqual(entitySchemas.goal.parse(legacy), legacy);
 assert.equal((entitySchemas.goal.parse(a) as Goal).updatedAt, secondTime);
 assert.throws(() => entitySchemas.goal.parse({ ...a, updatedAt: 'not-a-time' }));
});
