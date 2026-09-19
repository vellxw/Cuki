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

export const tabPaths = {
  home: '/(tabs)/home', recipes: '/(tabs)/recipes',
  train: '/(tabs)/train', progress: '/(tabs)/progress',
} as const;
export const rootScreenPaths: Readonly<Record<string, string>> = {
  'SC-07': tabPaths.home, 'SC-23': tabPaths.recipes,
  'SC-42': tabPaths.train, 'SC-57': tabPaths.progress,
};
/** Return locations are internal navigation context, not arbitrary deep-link URLs. */
export function safeReturnHref(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || /[\\\x00-\x1f]/.test(value)) return null;
  const path = value.split(/[?#]/, 1)[0];
  return /^(?:\/\(tabs\))?\/(?:home|recipes|train|progress)$/.test(path) || /^\/screen\/SC-\d{2}$/.test(path) ? value : null;
}
export function originHref(path: string, params: RouteParameters): string {
  const query = Object.entries(params)
    .filter(([key, value]) => key !== 'screenId' && key !== 'returnTo' && typeof value === 'string')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
  return safeReturnHref(path + (query ? '?' + query : '')) ?? tabPaths.home;
}

/** These detail routes retain the product navigation shown in the approved references.
 * Full-screen capture, onboarding, editors and harvest celebration deliberately do not. */
export function dockSectionForScreen(screen:string):'home'|'recipes'|'register'|'train'|'progress'|null {
 const sections:Record<string,'recipes'|'register'|'train'|'progress'>={
  'SC-20':'register','SC-26':'recipes','SC-47':'train','SC-48':'train',
  'SC-79':'progress','SC-81':'progress','SC-83':'progress','SC-86':'progress',
 };return sections[screen]??null;
}

/** Ignore repeated/non-scalar query values instead of guessing which plan was meant. */
export function routeParameters(values:Record<string,unknown>):Record<string,string> {
 return Object.fromEntries(Object.entries(values).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
}
