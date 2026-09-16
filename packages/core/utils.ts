import type {AppState,DiaryEntry,Food,Goal,Nutrients,NutrientKey,Recipe,SetEntry,WorkoutSession} from './types';
export function invariant(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message)}
let uuidSource:()=>string=()=>{const c=globalThis.crypto;invariant(c?.randomUUID,'Configure a cryptographically secure UUID source.');return c.randomUUID()};
export function configureUUID(fn:()=>string){uuidSource=fn}export const uid=()=>uuidSource();
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const fmt=(n:number|null|undefined,d=0)=>n==null?'—':new Intl.NumberFormat('es-AR',{maximumFractionDigits:d}).format(n);
export function numberInput(text:string,opts:{min?:number;max?:number;integer?:boolean;nullable?:boolean}={}):number|null {const s=text.trim().replace(',','.');if(!s&&opts.nullable)return null;invariant(s!==''&&/^-?(?:\d+\.?\d*|\.\d+)$/.test(s),'Ingresá un número válido.');const n=Number(s);invariant(Number.isFinite(n)&&n>=(opts.min??-Infinity)&&n<=(opts.max??Infinity)&&(!opts.integer||Number.isInteger(n)),'El valor está fuera del rango permitido.');return n}
export const nutrientKeys:NutrientKey[]=['energy','protein','carbs','fat','fiber','sugar','sodium'];
export const unknownNutrients=():Nutrients=>Object.fromEntries(nutrientKeys.map(k=>[k,null])) as Nutrients;
export function validateNutrients(n:Nutrients){for(const k of nutrientKeys)invariant(n[k]===null||(typeof n[k]==='number'&&Number.isFinite(n[k])&&n[k]!>=0),`Nutriente inválido: ${k}`)}
export function scaleNutrients(n:Nutrients,factor:number):Nutrients {invariant(Number.isFinite(factor)&&factor>=0,'Cantidad inválida.');return Object.fromEntries(nutrientKeys.map(k=>[k,n[k]===null?null:n[k]!*factor])) as Nutrients}
export function sumNutrients(items:Nutrients[]):Nutrients {return Object.fromEntries(nutrientKeys.map(k=>[k,items.length===0?0:items.some(x=>x[k]===null)?null:items.reduce((n,x)=>n+x[k]!,0)])) as Nutrients}
export function recipeNutrition(recipe:Recipe,foods:Food[],servings=1):Nutrients {invariant(Number.isFinite(recipe.servings)&&recipe.servings>0,'La receta necesita porciones positivas.');return scaleNutrients(sumNutrients(recipe.ingredients.map(i=>{const f=i.snapshot??foods.find(f=>f.id===i.foodId&&(!i.foodVersion||f.version===i.foodVersion));invariant(f,`Falta la versión del ingrediente ${i.foodId}.`);invariant(i.grams>0&&Number.isFinite(i.grams),'Cantidad de ingrediente inválida.');return scaleNutrients(f.nutrients,i.grams/100)})),servings/recipe.servings)}
export function localDate(now=new Date(),zone?:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(k=>parts.find(x=>x.type===k)!.value).join('-')}
export function validDate(s:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s}
export const prettyDate=(s:string)=>validDate(s)?new Date(s+'T12:00:00Z').toLocaleDateString('es-AR',{day:'numeric',month:'short',timeZone:'UTC'}):s;
export const instantLabel=(s:string)=>Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('es-AR'):'Fecha no disponible';
/** The effective date selects the day; modification time selects revisions of THAT day.
 * Entity version is a sync conflict counter, not chronology across unrelated goal IDs.
 * Older snapshots without updatedAt remain readable. Equal-time concurrent goals use
 * a deterministic tie-breaker, so download/array order cannot change the active goal.
 */
export function goalAt(goals:Goal[]|AppState,date?:string):Goal|null {
 const list=Array.isArray(goals)?goals:goals.goals;
 const at=date??(!Array.isArray(goals)?goals.selectedDate:localDate());
 const stamp=(g:Goal)=>{const time=Date.parse(g.updatedAt??'');return Number.isFinite(time)?time:0};
 return [...list].filter(g=>g.effectiveFrom<=at).sort((a,b)=>
  b.effectiveFrom.localeCompare(a.effectiveFrom)||stamp(b)-stamp(a)||b.version-a.version||b.id.localeCompare(a.id)
 )[0]??null;
}
export function dayNutrition(state:AppState,date=state.selectedDate){return sumNutrients(state.diary.filter(e=>e.date===date&&!e.deletedAt).map(e=>e.nutrition))}
export function duration(seconds:number){const n=Math.max(0,Math.floor(seconds));return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`}
export function sessionSeconds(s:WorkoutSession,now=Date.now()){return Math.max(0,((s.endedAt?Date.parse(s.endedAt):s.pausedAt?Date.parse(s.pausedAt):now)-Date.parse(s.startedAt))/1000-s.pausedSeconds)}
export function setValid(s:SetEntry){if(!s.completedAt||s.kind==='warmup')return false;return (s.kind==='timed'||s.loadMode==='time')?!!s.seconds&&s.seconds>0:(s.kind==='distance'||s.loadMode==='distance')?!!s.meters&&s.meters>0:!!s.reps&&s.reps>0&&(s.loadMode==='bodyweight'||s.loadMode==='assisted'||s.load!==null&&s.load>=0)}
export function sessionQualifies(s:WorkoutSession){return s.status==='completed'&&!!s.endedAt&&Date.parse(s.endedAt)>=Date.parse(s.startedAt)&&s.exercises.some(e=>e.sets.some(setValid))}
export function validateEntry(e:DiaryEntry){invariant(validDate(e.date),'Fecha inválida.');invariant(e.amount>0&&Number.isFinite(e.amount),'La cantidad debe ser positiva.');validateNutrients(e.nutrition);invariant(e.snapshot.foods.length>0,'Falta la fuente nutricional.');invariant(['g','ml','serving'].includes(e.unit),'Unidad inválida.');}
export function entryFromFood(food:Food,amount:number,date:string,meal:DiaryEntry['meal'],timezone:string):DiaryEntry{const e:DiaryEntry={id:uid(),version:1,date,timezone,meal,name:food.name,foodId:food.id,sourceVersion:food.version,amount,unit:food.basis==='per_100ml'?'ml':'g',nutrition:scaleNutrients(food.nutrients,amount/100),snapshot:{foods:[JSON.parse(JSON.stringify(food))]},createdAt:new Date().toISOString(),deletedAt:null};validateEntry(e);return e}
export function entryFromRecipe(r:Recipe,foods:Food[],servings:number,date:string,meal:DiaryEntry['meal'],timezone:string):DiaryEntry{const versions=r.ingredients.map(i=>i.snapshot??foods.find(f=>f.id===i.foodId&&(!i.foodVersion||f.version===i.foodVersion))).filter((f):f is Food=>!!f);invariant(versions.length===r.ingredients.length,'Faltan fuentes de ingredientes.');const e:DiaryEntry={id:uid(),version:1,date,timezone,meal,name:r.title,recipeId:r.id,sourceVersion:r.version,amount:servings,unit:'serving',nutrition:scaleNutrients(recipeNutrition(r,foods),servings),snapshot:{foods:JSON.parse(JSON.stringify(versions)),recipe:JSON.parse(JSON.stringify(r))},createdAt:new Date().toISOString(),deletedAt:null};validateEntry(e);return e}
export function stableJSON(value:unknown):string{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';return '{'+Object.keys(value as object).sort().map(k=>JSON.stringify(k)+':'+stableJSON((value as Record<string,unknown>)[k])).join(',')+'}'}
