export type NutrientKey='energy'|'protein'|'carbs'|'fat'|'fiber'|'sugar'|'sodium';
export type Nutrients=Record<NutrientKey,number|null>;
export interface Food { id:string; version:number; name:string; brand:string; basis:'per_100g'|'per_100ml'; preparation:'raw'|'cooked'|'as_sold'; nutrients:Nutrients; source:string; sourceUrl:string|null; license:string; market:string; gtin:string|null; servings:{name:string;amount:number;unit:'g'|'ml'}[]; ownerId?:string; state:'editorial'|'private'|'pending'|'reviewed'|'needs_changes'|'rejected'; updatedAt:string; }
export interface Ingredient {id:string; foodId:string; grams:number; foodVersion?:number; snapshot?:Food}
export interface RecipeStep {id:string;text:string;seconds:number|null}
export interface Recipe {id:string; version:number; title:string;description:string;authorId:string;authorName:string;visibility:'editorial'|'private'|'pending'|'public'|'withdrawn';minutes:number;servings:number;cookedYield:number|null;photoUri:string|null;assetKey?:string|null; previousVersionId?:string;assetIds?:string[];tags:string[];ingredients:Ingredient[];steps:RecipeStep[];createdAt:string;updatedAt?:string;upvotes?:number}
export type Meal='breakfast'|'lunch'|'snack'|'dinner';
export const MEALS:Record<Meal,string>={breakfast:'Desayuno',lunch:'Almuerzo',snack:'Merienda',dinner:'Cena'};
export interface DiaryEntry {id:string;version:number;date:string;timezone:string;meal:Meal;name:string;foodId?:string;recipeId?:string;sourceVersion:number;amount:number;unit:'g'|'ml'|'serving';basis?:string;nutrition:Nutrients;snapshot:{foods:Food[];recipe?:Recipe};createdAt:string;deletedAt:string|null}
export interface Goal {id:string;version:number;effectiveFrom:string;energy:number|null;protein:number|null;carbs:number|null;fat:number|null}
export interface Profile {name:string;timezone:string;units:'metric'|'imperial';showCalories:boolean;hideGarden:boolean;reminders:boolean;theme:'dark'|'light'|'system';reduceMotion:boolean;reduceTransparency:boolean;onboarded:boolean;intention:string;allergies:string[];excluded:string[];equipment:string[];days:number;consentVersion:string|null}
export type LoadMode='external_total'|'external_per_side'|'bodyweight'|'assisted'|'time'|'distance';
export type SetKind='working'|'warmup'|'drop'|'timed'|'distance';
export interface Exercise {id:string;name:string;muscle:string;pattern:string;equipment:string;instructions:string[];modality:'strength'|'timed'|'distance';loadMode:LoadMode;custom:boolean;mediaUri:string|null}
export interface SetEntry {id:string;version:number;kind:SetKind;loadMode:LoadMode;load:number|null;reps:number|null;seconds:number|null;meters:number|null;rir:number|null;note:string;completedAt:string|null}
export interface PlanExercise {id:string;exerciseId:string;sets:number;repsMin:number;repsMax:number;load:number|null;restSeconds:number;superset:string|null}
export interface PlanDay {id:string;name:string;exercises:PlanExercise[]}
export interface WorkoutPlan {id:string;version:number;name:string;weeks:number;deload:boolean;days:PlanDay[];createdAt:string}
export interface SessionExercise {id:string;exerciseId:string;sets:SetEntry[];restSeconds:number;superset:string|null}
export interface WorkoutSession {id:string;version:number;name:string;planId:string|null;date:string;timezone:string;status:'active'|'paused'|'completed'|'discarded';startedAt:string;endedAt:string|null;pausedAt:string|null;pausedSeconds:number;exercises:SessionExercise[];currentExercise:number;note:string;restDeadline:number|null;restNotificationId:string|null}
export interface Comment {id:string;recipeId:string;parentId:string|null;authorId:string;authorName:string;text:string;createdAt:string;state:'pending'|'public'|'deleted'}
export interface Collection {id:string;name:string;recipeIds:string[]}
export interface PlannedMeal {id:string;version:number;date:string;meal:Meal;recipeId:string;recipe:Recipe;servings:number}
export interface PantryItem {id:string;foodId:string;amount:number;unit:'g'|'ml'}
export interface Measurement {id:string;date:string;kind:'weight'|'waist'|'hip'|'chest';value:number;unit:'kg'|'cm'}
export interface PlantInstance {id:string;seed:number;species:string;generatorVersion:string;rendererVersion:string;grownWeeks:number;archivedAt:string|null}
export interface GardenWeek {index:number;startAt:string;endAt:string;state:'future'|'open'|'credited'|'awaiting_sync'|'missed';credit:{sessionId:string;receivedAt:string}|null}
export interface GardenChallenge {id:string;version:number;state:'active'|'interrupted'|'ready_to_harvest'|'harvested'|'archived';timezone:string;policyVersion:string;boundaries:string[];serverNow:string;startAt:string;endAt:string;creditedWeeks:number;plant:PlantInstance;weeks:GardenWeek[]}
export interface Coin {id:string;challengeId:string;state:'available'|'reserved'|'redeemed';earnedAt:string}
export interface RewardQuote {id:string;coin_id:string;eligible:boolean;reason:string;billing_effect:string;benefit_start_at:string|null;benefit_end_at:string|null;auto_renew_after:boolean|null;expires_at:string;terms_hash:string;route:string|null}
export interface Redemption {id:string;coinId:string;state:'reserved'|'awaiting_provider'|'confirmed'|'unknown_reconciling'|'failed_released';message:string;startsAt:string|null;endsAt:string|null;providerReference?:string}
export interface Entitlement {plan:'free'|'trial'|'plus'|'reward_plus';state:'active'|'expired'|'pending'|'grace';verifiedAt:string|null;expiresAt:string|null;captures:{used:number;reserved:number;limit:number};actions:{used:number;reserved:number;limit:number};store:'app_store'|'play_store'|'promotional'|null}
export type AIRoute='photo'|'label'|'voice'|'text'|'next_meal'|'weekly_plan'|'substitution'|'training_plan'|'progression'|'weekly_review';
export interface AIIngredient {id:string;name:string;foodId:string|null;amount:number;unit:'g'|'ml';note:string}
export interface AIJob {id:string;route:AIRoute;state:'queued'|'running'|'review'|'failed'|'cancelled'|'applied';createdAt:string;mediaUri:string|null;input:string;ingredients:AIIngredient[];result:unknown;error:string|null}
export interface Proposal {id:string;version:number;route:AIRoute;state:'pending'|'accepted'|'rejected'|'reverted';explanation:string;changes:{entityType:string;entityId:string;baseVersion:number;before:unknown;after:unknown}[];createdAt:string}
export interface OutboxOp {id:string;entityType:string;entityId:string;baseVersion:number;payload:unknown;deleted:boolean;createdAt:string;state:'pending'|'conflict'|'failed';error?:string;remote?:unknown}
export interface AppState {schemaVersion:number;accountId:string;revision:number;profile:Profile;selectedDate:string;localPlantSeed:number;foods:Food[];recipes:Recipe[];diary:DiaryEntry[];goals:Goal[];sessions:WorkoutSession[];plans:WorkoutPlan[];exercises:Exercise[];drafts:Record<string,unknown>;comments:Comment[];collections:Collection[];savedRecipeIds:string[];votedRecipeIds:string[];followedIds:string[];blockedIds:string[];cooking:{recipeId:string;step:number;deadline:number|null}|null;cookedIds:string[];plannedMeals:PlannedMeal[];pantry:PantryItem[];shoppingChecks:string[];measurements:Measurement[];jobs:AIJob[];proposals:Proposal[];garden:GardenChallenge|null;plants:PlantInstance[];coins:Coin[];quotes:RewardQuote[];redemptions:Redemption[];entitlement:Entitlement;outbox:OutboxOp[];cursor:string|null;lastSyncAt:string|null;requestKeys:Record<string,string>;}
export type ToggleField='savedRecipeIds'|'votedRecipeIds'|'followedIds'|'blockedIds'|'shoppingChecks';
export type Command=
 |{type:'profile';profile:Partial<Profile>}|{type:'date';date:string}|{type:'goal';goal:Goal}
 |{type:'food';food:Food}|{type:'recipe';recipe:Recipe}|{type:'entry';entry:DiaryEntry}|{type:'deleteEntry'|'restoreEntry';id:string}
 |{type:'toggle';field:ToggleField;id:string}|{type:'collection';collection:Collection}|{type:'comment';comment:Comment}|{type:'deleteComment';id:string}
 |{type:'cooking';cooking:AppState['cooking']}|{type:'cooked';recipeId:string}
 |{type:'plan';plan:WorkoutPlan}|{type:'deletePlan';id:string}|{type:'exercise';exercise:Exercise}
 |{type:'startSession';session:WorkoutSession}|{type:'set';sessionId:string;exerciseId:string;set:SetEntry;complete?:boolean}
 |{type:'deleteSet';sessionId:string;exerciseId:string;setId:string}|{type:'sessionExercise';sessionId:string;replaceId?:string;exercise:SessionExercise}
 |{type:'sessionIndex';sessionId:string;index:number}|{type:'sessionNote';id:string;note:string}|{type:'pauseSession'|'resumeSession'|'discardSession';id:string}|{type:'finishSession';id:string;note:string}
 |{type:'rest';sessionId:string;deadline:number|null}|{type:'notification';sessionId:string;notificationId:string|null}
 |{type:'draft';key:string;value:unknown}|{type:'dropDraft';key:string}
 |{type:'plannedMeal';meal:PlannedMeal}|{type:'deletePlannedMeal';id:string}|{type:'pantry';item:PantryItem}|{type:'deletePantry';id:string}
 |{type:'measurement';measurement:Measurement}|{type:'deleteMeasurement';id:string}|{type:'job';job:AIJob}|{type:'proposal';proposal:Proposal};
