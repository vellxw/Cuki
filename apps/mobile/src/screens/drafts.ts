import {uid,numberInput} from '../../../../packages/core/utils';import type {Ingredient,RecipeStep,PlanDay,WorkoutPlan} from '../../../../packages/core/types';
export interface RecipeDraft {id:string;editingId?:string;title:string;description:string;servings:string;yield:string;minutes:string;tags:string;photoUri:string|null;ingredients:Ingredient[];steps:RecipeStep[];rights:boolean}
export const newRecipeDraft=():RecipeDraft=>({id:uid(),title:'',description:'',servings:'1',yield:'',minutes:'20',tags:'',photoUri:null,ingredients:[],steps:[{id:uid(),text:'',seconds:null}],rights:false});
export type PlanNumberKey = 'sets'|'repsMin'|'repsMax'|'restSeconds'|'load';
export interface PlanDraft {id:string;version:number;name:string;weeks:string;deload:boolean;days:PlanDay[];day?:number;createdAt:string;numericInputs?:Record<string,Partial<Record<PlanNumberKey,string>>>}
export const newPlanDraft=():PlanDraft=>({id:uid(),version:0,name:'',weeks:'6',deload:false,days:[{id:uid(),name:'Día A',exercises:[]}],day:0,createdAt:new Date().toISOString()});

/** Keep transient native text (including a decimal separator or an empty field) in
 * the durable draft; normalize only when the user actually saves the plan. */
export function planFromDraft(draft:PlanDraft):WorkoutPlan {
 const read=(text:string,label:string,options:Parameters<typeof numberInput>[1])=>{
  try{return numberInput(text,options)}catch(error){throw new Error(label+': '+(error instanceof Error?error.message:'Valor inválido.'))}
 };
 return {id:draft.id,version:draft.version+1,name:draft.name,
  weeks:read(draft.weeks,'Duración del bloque',{min:1,max:104,integer:true})!,
  deload:draft.deload,createdAt:draft.createdAt,
  days:draft.days.map(day=>({...day,exercises:day.exercises.map((exercise,index)=>{
   const input=draft.numericInputs?.[exercise.id]??{};
   const text=(key:PlanNumberKey)=>input[key]??(exercise[key]===null?'':String(exercise[key]));
   const label=(name:string)=>name+', ejercicio '+(index+1)+' ('+day.name+')';
   return {...exercise,
    sets:read(text('sets'),label('Series'),{min:1,max:50,integer:true})!,
    repsMin:read(text('repsMin'),label('Reps mínimas'),{min:1,max:100000,integer:true})!,
    repsMax:read(text('repsMax'),label('Reps máximas'),{min:1,max:100000,integer:true})!,
    restSeconds:read(text('restSeconds'),label('Descanso'),{min:0,max:3600,integer:true})!,
    load:read(text('load'),label('Carga inicial'),{min:0,max:10000000,nullable:true})};
  })}))};
}
