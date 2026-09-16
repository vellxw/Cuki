/** Logical identities for the single Expo file route used by the screen registry.
 * Route filenames alone are not enough: without this identity POP_TO can relabel a
 * quantity screen as a recipe while leaving the original recipe underneath it.
 * Data-entry values and return URLs are deliberately NOT part of route identity.
 */
export type RouteParameters = Record<string, unknown>;
function scalar(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}
export function editorDraftKey(kind: 'recipe' | 'plan', params: RouteParameters): string {
  return scalar(params.draftKey) ?? `${kind}-editor:${scalar(params.id) ?? 'new'}`;
}
const entityKeys = [
  'id', 'foodId', 'recipeId', 'entryId', 'jobId', 'ingredientId', 'setId',
  'exerciseId', 'sessionId', 'sessionExerciseId', 'proposalId', 'quoteId',
  'coinId', 'plantId', 'userId', 'draftKey', 'dayId', 'mode',
] as const;
export function screenIdentity(name: string, params: RouteParameters = {}): string {
  const screen = scalar(params.screenId) ?? name;
  if (['SC-32', 'SC-33', 'SC-34', 'SC-35'].includes(screen)) {
    return JSON.stringify([screen, editorDraftKey('recipe', params)]);
  }
  if (screen === 'SC-44') return JSON.stringify([screen, editorDraftKey('plan', params)]);
  return JSON.stringify([screen, ...entityKeys.flatMap(key => {
    const value = scalar(params[key]);
    return value === undefined || value === '' ? [] : [[key, value]];
  })]);
}
