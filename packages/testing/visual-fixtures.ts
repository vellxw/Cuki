import {CURRENT_RENDERER} from '../garden-engine/leaf-raster';
/** Synthetic rendering fixtures from blueprint v2. Never a food catalog, real workout
 * history, photo-accuracy evaluation, entitlement or server-authorized garden reward.
 * Loaded only by a separately identified native visual-QA build with no cloud URL.
 */
import type {AppState,Food,Recipe,WorkoutPlan,GardenChallenge} from '../core/types';
import {initialState,createSession} from '../core/state';
import {entryFromFood} from '../core/utils';
import {boundaries,evaluate,generatePlant} from '../garden-engine';
export const VISUAL_SCENES=['home','recipes','recipe','scan','training','garden'] as const;
export type VisualScene=typeof VISUAL_SCENES[number];
export const FIXTURE_NOW='2026-09-14T12:00:00.000Z';
export const FIXTURE_SEED=1852006;
export function visualBuildAllowed(extra:Record<string,unknown>,appId:string){
 return extra.testMode===true&&extra.visualMode===true&&appId==='com.cuki.app.visual'&&!extra.apiUrl&&!extra.authUrl&&!extra.revenueCatIos&&!extra.revenueCatAndroid;
}
export function isVisualScene(value:unknown):value is VisualScene{return typeof value==='string'&&(VISUAL_SCENES as readonly string[]).includes(value);}
function food(id:string,name:string,amount:number,energy:number,protein:number,carbs:number,fat:number):Food {
 const factor=100/amount;
 return{id:'visual-'+id,version:1,name,brand:'',basis:'per_100g',preparation:'cooked',source:'Synthetic visual-QA fixture, not a verified food',sourceUrl:null,license:'Internal test fixture',market:'AR',gtin:null,state:'editorial',servings:[],updatedAt:FIXTURE_NOW,
 nutrients:{energy:energy*factor,protein:protein*factor,carbs:carbs*factor,fat:fat*factor,fiber:null,sugar:null,sodium:null}};
}
export function createVisualState(scene:VisualScene):{state:AppState;screen:string;params:Record<string,string>;tab:'home'|'recipes'|'train'|'progress'|'register'}{
 const state=initialState('visual-reference:'+scene,'America/Argentina/Buenos_Aires',FIXTURE_NOW);
 state.profile={...state.profile,name:'Franco',onboarded:true,reduceMotion:true,theme:'dark'};state.localPlantSeed=FIXTURE_SEED;
 state.goals=[{id:'visual-goal',version:1,effectiveFrom:'2026-09-14',energy:2000,protein:140,carbs:225,fat:60}];
 const total=food('day','Fixture del día — NO ES UN ALIMENTO',100,1620,108,189,48);
 const dayEntry=entryFromFood(total,100,state.selectedDate,'lunch',state.profile.timezone);dayEntry.id='visual-day';dayEntry.createdAt=FIXTURE_NOW;state.diary=[dayEntry];
 const spec:[string,string,number,number,number,number,number][]=[
 ['chicken','Pechuga de pollo',100,160,28,0,48/9],['rice','Arroz integral',100,164,4,37,0],['broccoli','Brócoli',100,32,2,6,0],
 ['edamame','Edamame',40,48,5,4,12/9],['avocado','Palta',30,70,1,4,50/9],['sesame','Sésamo',5,46,2,1,34/9]];
 const foods=spec.map(s=>food(...s));state.foods.push(total,...foods);
 const recipe:Recipe={id:'visual-teriyaki',version:1,title:'Bowl de pollo teriyaki',description:'Pollo, arroz y vegetales en un bowl. Cantidades sintéticas para comprobar la interfaz.',authorId:'visual-author',authorName:'@laura_cocina',visibility:'public',minutes:20,servings:1,cookedYield:375,photoUri:null,assetKey:'bowl',tags:['Fitness','Rápidas'],createdAt:FIXTURE_NOW,
 ingredients:foods.map((f,i)=>({id:'visual-ingredient-'+i,foodId:f.id,foodVersion:1,snapshot:f,grams:spec[i][2]})),steps:[{id:'visual-step1',text:'Prepará el arroz y los vegetales por separado.',seconds:600},{id:'visual-step2',text:'Cociná el pollo y armá el bowl con los ingredientes.',seconds:null}]};
 state.recipes=[recipe,...state.recipes];
 const plan:WorkoutPlan={id:'visual-plan',version:1,name:'Upper A',weeks:8,deload:false,createdAt:FIXTURE_NOW,days:[{id:'visual-day-a',name:'Upper A',exercises:['pulldown','lateral','incline-machine','row-machine','biceps','triceps'].map((id,i)=>({id:'visual-plan-ex-'+i,exerciseId:id,sets:4,repsMin:8,repsMax:12,load:70,restSeconds:120,superset:null}))}]};
 state.plans=[plan];
 const stage=scene==='garden'?38:18;
 const start=new Date(Date.parse(FIXTURE_NOW)-(stage-1)*7*86400000-3600000).toISOString();
 const limits=boundaries(start,state.profile.timezone),values=evaluate(limits,Array.from({length:stage},(_,i)=>i),FIXTURE_NOW),descriptor=generatePlant(FIXTURE_SEED);
 const garden:GardenChallenge={id:'visual-cycle',version:1,state:'active',timezone:state.profile.timezone,policyVersion:'garden-policy-2.0.0',boundaries:limits,serverNow:FIXTURE_NOW,startAt:start,endAt:limits[52],creditedWeeks:stage,
 plant:{id:'visual-plant',seed:FIXTURE_SEED,species:descriptor.species,generatorVersion:descriptor.generatorVersion,rendererVersion:CURRENT_RENDERER,grownWeeks:stage,archivedAt:null},
 weeks:values.windows.map(w=>({index:w.index,startAt:w.start,endAt:w.end,state:w.state as 'credited'|'future'|'open',credit:w.state==='credited'?{sessionId:'visual-credit-'+w.index,receivedAt:new Date(Date.parse(w.start)+1800000).toISOString()}:null}))};
 state.garden=garden;
 if(scene==='garden')state.plants=[{...garden.plant,id:'visual-collection-a',seed:77351,grownWeeks:52,archivedAt:'2025-09-14T12:00:00Z'},{...garden.plant,id:'visual-collection-b',seed:927514,grownWeeks:52,archivedAt:'2024-09-14T12:00:00Z'}];
 if(scene==='training'){
  const session=createSession(state,plan,0,undefined,new Date(Date.parse(FIXTURE_NOW)-1200000).toISOString());session.id='visual-session';session.version=1;session.currentExercise=2;
  session.exercises.forEach((e,i)=>{e.id='visual-session-ex-'+i;e.sets.forEach((s,j)=>{s.id='visual-set-'+i+'-'+j;s.version=1;s.load=i===2&&j>1?72.5:70;s.reps=8;if(i<2||i===2&&j<2)s.completedAt=FIXTURE_NOW;});});state.sessions=[session];
 }
 if(scene==='scan'){
  const sf=[food('scan-chicken','Pollo',138,205,40,0,5),food('scan-rice','Arroz',165,293,6,65,1),food('scan-avocado','Palta',46,119,2,3,11)];state.foods.push(...sf);
  state.jobs=[{id:'visual-scan',route:'photo',state:'review',createdAt:FIXTURE_NOW,mediaUri:null,input:'Synthetic scan UI only',result:null,error:null,ingredients:sf.map((f,i)=>({id:'visual-detected-'+i,name:f.name,foodId:f.id,amount:[138,165,46][i],unit:'g',note:'Estimación sintética para pruebas visuales'}))}];
 }
 state.outbox=[];state.syncVersions={};state.requestKeys={};
 const screens={home:'SC-07',recipes:'SC-23',recipe:'SC-26',scan:'SC-20',training:'SC-47',garden:'SC-79'};
 const tabs={home:'home',recipes:'recipes',recipe:'recipes',scan:'register',training:'train',garden:'progress'} as const;
 const params=scene==='recipe'?{id:recipe.id}:scene==='scan'?{jobId:'visual-scan'}:scene==='training'?{id:'visual-session'}:{};
 return{state,screen:screens[scene],params:params as Record<string,string>,tab:tabs[scene]};
}
