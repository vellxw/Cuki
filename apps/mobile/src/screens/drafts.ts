import {uid} from '../../../../packages/core/utils';import type {Ingredient,RecipeStep,PlanDay} from '../../../../packages/core/types';
export interface RecipeDraft {id:string;editingId?:string;title:string;description:string;servings:string;yield:string;minutes:string;tags:string;photoUri:string|null;ingredients:Ingredient[];steps:RecipeStep[];rights:boolean}
export const newRecipeDraft=():RecipeDraft=>({id:uid(),title:'',description:'',servings:'1',yield:'',minutes:'20',tags:'',photoUri:null,ingredients:[],steps:[{id:uid(),text:'',seconds:null}],rights:false});
export interface PlanDraft {id:string;version:number;name:string;weeks:string;deload:boolean;days:PlanDay[];day?:number;createdAt:string}
export const newPlanDraft=():PlanDraft=>({id:uid(),version:0,name:'',weeks:'6',deload:false,days:[{id:uid(),name:'Día A',exercises:[]}],day:0,createdAt:new Date().toISOString()});
