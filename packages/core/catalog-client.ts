import {z} from 'zod';
import {ApiClient, ApiError} from './api';
import type {ClientRepo} from './repository';
import type {Food} from './types';
import {foodSchema} from '../contracts/entities';
import {invariant} from './utils';

/** Both endpoints return the source directly (Food[] / Food), not a fabricated wrapper. */
export async function cacheFoods(repo: ClientRepo, foods: Food[]) {
  await repo.mutate(state => {
    for (const food of foods) {
      if (state.outbox.some(op => op.entityType === 'food' && op.entityId === food.id)) continue;
      const index = state.foods.findIndex(old => old.id === food.id);
      if (index < 0) state.foods.push(food);
      else if (state.foods[index].version <= food.version) state.foods[index] = food;
    }
  });
}
export async function searchFoods(api: ApiClient, repo: ClientRepo, query: string): Promise<Food[]> {
  const result = z.array(foodSchema).parse(await api.request('/v1/foods?q=' + encodeURIComponent(query.trim())));
  await cacheFoods(repo, result);
  return result;
}
export async function findBarcode(api: ApiClient, repo: ClientRepo, code: string, market = 'AR'): Promise<Food | null> {
  invariant(/^[A-Z]{2}$/.test(market), 'Mercado de producto inválido.');
  const local = repo.getSnapshot().foods.find(food => food.gtin === code && food.market === market);
  if (local) return local;
  if (!api.configured) return null;
  try {
    const result = foodSchema.parse(await api.request('/v1/foods/barcode/' + encodeURIComponent(code) + '?market=' + market));
    invariant(result.gtin === code && result.market === market, 'El servidor devolvió otro producto. Volvé a buscar.');
    await cacheFoods(repo, [result]);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error; // Offline/auth/provider failures are not falsely reported as an unknown food.
  }
}
