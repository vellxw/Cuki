/** Domain contracts shared by the native client, API and tests. All instants are ISO UTC. */
export type Id = string;
export const MEALS = {breakfast:'Desayuno',lunch:'Almuerzo',snack:'Merienda',dinner:'Cena',other:'Otros'} as const;
export type Meal = keyof typeof MEALS;
export const NUTRIENTS = ['energy_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg'] as const;
export type NutrientKey = typeof NUTRIENTS[number];
export type Nutrients = Record<NutrientKey, number | null>;
export type Units = 'metric' | 'imperial';
export interface Source { name: string; url: string | null; id?: string; license?: string; retrievedAt?: string; }
export interface Food {
  id: Id; version: number; name: string; brand: string | null; state: 'raw' | 'cooked' | 'as_sold';
  basis: 'per_100g' | 'per_100ml'; per100: Nutrients; servingGrams: number | null; servingLabel?: string;
  density: number | null; barcode: string | null; market: string; source: Source;
  authorId: Id | null; visibility: 'editorial' | 'private' | 'pending' | 'public'; verified: boolean;
  photoUri: string | null; createdAt: string; assetKey?: string | null; allergens?: string[];
}
export interface Ingredient { id: Id; foodId: Id; grams: number; }
export interface RecipeStep { id: Id; text: string; seconds: number | null; }
export interface Recipe {
  id: Id; version: number; title: string; description: string; servings: number; cookedYield: number | null;
  minutes: number; tags: string[]; ingredients: Ingredient[]; steps: RecipeStep[]; photoUri: string | null;
  assetKey?: string | null; authorId: Id; authorName: string; visibility: 'editorial' | 'private' | 'pending' | 'public';
  createdAt: string; previousVersionId?: Id | null; voteCount?: number; commentCount?: number; assetIds?: Id[];
}
export interface DiaryEntry {
  id: Id; version: number; date: string; meal: Meal; name: string;
  foodId: Id | null; recipeId: Id | null; sourceVersion: number | null;
  quantity: number; basis: 'grams' | 'milliliters' | 'servings'; nutrients: Nutrients;
  source: Source; ingredients?: Ingredient[]; createdAt: string; updatedAt: string; deletedAt: string | null;
}
export interface Goal { id: Id; date: string; nutrients: Nutrients; }
export interface Comment { id: Id; recipeId: Id; authorId: Id; authorName: string; text: string; createdAt: string; deletedAt?: string | null; parentId: Id | null; state: 'pending' | 'published' | 'deleted'; }
export interface Collection { id: Id; name: string; recipeIds: Id[]; }
export interface Cooking { recipeId: Id; step: number; deadline: number | null; startedAt: string; }
export type LoadMode = 'external_total' | 'external_per_side' | 'bodyweight' | 'assisted' | 'time' | 'distance';
export type SetKind = 'working' | 'warmup' | 'drop' | 'timed' | 'distance';
export interface Exercise { id: Id; name: string; muscle: string; pattern: string; equipment: string; instructions: string[]; modality: 'strength' | 'timed' | 'distance'; loadMode: LoadMode; custom: boolean; mediaUri: string | null; }
export interface PlanExercise { id: Id; exerciseId: Id; sets: number; repsMin: number; repsMax: number; load: number | null; restSeconds: number; superset: string | null; }
export interface PlanDay { id: Id; name: string; exercises: PlanExercise[]; }
export interface WorkoutPlan { id: Id; version: number; name: string; days: PlanDay[]; weeks: number; deload: boolean; createdAt: string; }
export interface SetEntry { id: Id; version: number; kind: SetKind; loadMode: LoadMode; load: number | null; reps: number | null; seconds: number | null; meters: number | null; rir: number | null; rpe: number | null; note: string; completedAt: string | null; deletedAt?: string | null; }
export interface SessionExercise { id: Id; exerciseId: Id; sets: SetEntry[]; restSeconds: number; superset: string | null; }
export interface WorkoutSession { id: Id; version: number; name: string; planId: Id | null; dayId: Id | null; date: string; status: 'active' | 'paused' | 'completed' | 'discarded'; startedAt: string; endedAt: string | null; pausedAt: string | null; pausedSeconds: number; currentExercise: number; exercises: SessionExercise[]; restDeadline: number | null; restNotificationId: string | null; note: string; }
export interface PlannedMeal { id: Id; date: string; meal: Meal; recipeId: Id; servings: number; }
export interface PantryItem { id: Id; foodId: Id; grams: number; }
export interface ShoppingItem { id: Id; name: string; grams: number | null; checked: boolean; manual: boolean; foodId: Id | null; }
export interface Measurement { id: Id; date: string; type: 'weight' | 'waist' | 'hip' | 'chest' | 'arm'; value: number; }
export interface Profile { name: string; onboarding: boolean; intent: string; units: Units; theme: 'dark' | 'light' | 'system'; reduceMotion: boolean; reduceTransparency: boolean; hideGarden: boolean; showCalories: boolean; reminders: boolean; equipment: string[]; excludedIngredients: string[]; dietaryPreferences: string[]; healthConsent: boolean; aiConsent: boolean; nutritionEnabled: boolean; trainingEnabled: boolean; }
export interface PlantDescriptor { id: Id; seed: number; species: string; grownWeeks: number; generatorVersion: string; rendererVersion: string; archivedAt: string | null; }
export interface GardenWeek { index: number; start: string; end: string; state: 'future' | 'open' | 'credited' | 'awaiting_sync' | 'missed'; sessionId: Id | null; }
export interface Garden { id: Id; version: number; timezone: string; state: 'active' | 'interrupted' | 'ready_to_harvest' | 'harvested' | 'archived'; policyVersion: string; startedAt: string; boundaries: string[]; creditedWeeks: number; weeks: GardenWeek[]; plant: PlantDescriptor; }
export interface Coin { id: Id; challengeId: Id; state: 'available' | 'reserved' | 'redeemed'; earnedAt: string; }
export interface RewardQuote { id: Id; coin_id: Id; compatible: boolean; reason: string; billing_effect: string; benefit_start_at: string | null; benefit_end_at: string | null; auto_renew_after: boolean | null; expires_at: string; terms_hash: string; provider_route: string | null; }
export interface Redemption { id: Id; coinId: Id; state: 'reserved' | 'awaiting_provider' | 'confirmed' | 'unknown_reconciling' | 'failed_released'; message: string; startsAt: string | null; endsAt: string | null; }
export interface Entitlement { plan: 'free' | 'trial' | 'plus' | 'reward_plus'; state: 'active' | 'grace' | 'expired' | 'pending'; verifiedAt: string | null; expiresAt: string | null; captures: { used: number; limit: number }; actions: { used: number; limit: number }; }
export interface AIIngredient { id: Id; name: string; grams: number; foodId: Id | null; notes: string; }
export interface AIResult { ingredients: AIIngredient[]; explanation: string; uncertainties: string[]; proposal?: AIProposal; }
export type AIKind = 'meal_photo' | 'label_photo' | 'meal_text' | 'meal_voice' | 'meal_plan' | 'training_plan' | 'substitute' | 'review' | 'question';
export interface AIJob { id: Id; kind: AIKind; state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; createdAt: string; result: AIResult | null; error: string | null; }
export interface AIProposal { id: Id; kind: AIKind; title: string; explanation: string; baseRevision: number; actions: UserAction[]; state: 'pending' | 'accepted' | 'rejected' | 'reverted'; createdAt: string; }
export interface SyncConflict { id: Id; commandId: Id; message: string; action: UserAction; createdAt: string; }
export interface OutboxItem { id: Id; action: UserAction; createdAt: string; attempts: number; }
export interface AppState {
  schema: number; accountId: Id; revision: number; selectedDate: string; profile: Profile;
  foods: Food[]; recipes: Recipe[]; diary: DiaryEntry[]; goals: Goal[];
  exercises: Exercise[]; plans: WorkoutPlan[]; sessions: WorkoutSession[]; comments: Comment[];
  savedRecipeIds: Id[]; votedRecipeIds: Id[]; followedIds: Id[]; blockedIds: Id[]; favoriteFoodIds: Id[];
  collections: Collection[]; cooking: Cooking | null; plannedMeals: PlannedMeal[]; pantry: PantryItem[]; shopping: ShoppingItem[]; measurements: Measurement[];
  drafts: Record<string, unknown>; localPlantSeed: number; garden: Garden | null; plants: PlantDescriptor[]; coins: Coin[]; quotes: RewardQuote[]; redemptions: Redemption[];
  entitlement: Entitlement; jobs: AIJob[]; proposals: AIProposal[]; outbox: OutboxItem[]; conflicts: SyncConflict[];
  syncCursor: number; syncedAt: string | null; requestKeys: Record<string, string>;
}
export type ToggleField = 'savedRecipeIds' | 'votedRecipeIds' | 'followedIds' | 'blockedIds' | 'favoriteFoodIds';
/** User-controlled actions. Server-only rewards/claims must never be added to this union. */
export type UserAction =
 | { type: 'date'; date: string }
 | { type: 'profile'; patch: Partial<Profile> }
 | { type: 'goal'; goal: Goal }
 | { type: 'food'; food: Food }
 | { type: 'entry'; entry: DiaryEntry; expectedVersion?: number }
 | { type: 'deleteEntry' | 'restoreEntry'; id: Id }
 | { type: 'recipe'; recipe: Recipe }
 | { type: 'toggle'; field: ToggleField; id: Id; value?: boolean }
 | { type: 'collection'; collection: Collection }
 | { type: 'comment'; comment: Comment }
 | { type: 'deleteComment'; id: Id }
 | { type: 'cooking'; cooking: Cooking | null }
 | { type: 'cooked'; recipeId: Id }
 | { type: 'draft'; key: string; value: unknown }
 | { type: 'dropDraft'; key: string }
 | { type: 'exercise'; exercise: Exercise }
 | { type: 'plan'; plan: WorkoutPlan }
 | { type: 'deletePlan'; id: Id }
 | { type: 'startSession'; session: WorkoutSession }
 | { type: 'set'; sessionId: Id; exerciseId: Id; set: SetEntry; complete?: boolean }
 | { type: 'deleteSet'; sessionId: Id; exerciseId: Id; setId: Id }
 | { type: 'sessionExercise'; sessionId: Id; exercise: SessionExercise; replaceId?: Id }
 | { type: 'sessionIndex'; sessionId: Id; index: number }
 | { type: 'sessionNote'; id: Id; note: string }
 | { type: 'pauseSession' | 'resumeSession' | 'finishSession' | 'discardSession'; id: Id; note?: string }
 | { type: 'rest'; sessionId: Id; deadline: number | null }
 | { type: 'notification'; sessionId: Id; notificationId: string | null }
 | { type: 'plannedMeal'; item: PlannedMeal }
 | { type: 'deletePlannedMeal'; id: Id }
 | { type: 'pantry'; item: PantryItem }
 | { type: 'deletePantry'; id: Id }
 | { type: 'shopping'; item: ShoppingItem }
 | { type: 'deleteShopping'; id: Id }
 | { type: 'measurement'; item: Measurement }
 | { type: 'deleteMeasurement'; id: Id }
 | { type: 'proposal'; proposal: AIProposal };
