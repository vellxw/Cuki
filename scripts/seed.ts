// Editorial source data is versioned in packages/core; never fabricate community activity.
import {initialState} from '../packages/core/state';
import {validateNutrients,recipeNutrition} from '../packages/core/utils';
const state=initialState('guest','UTC');
for(const f of state.foods)validateNutrients(f.nutrients);
for(const r of state.recipes)recipeNutrition(r,state.foods);
console.log(`Catálogo editorial validado: ${state.foods.length} alimentos, ${state.recipes.length} recetas y ${state.exercises.length} ejercicios. No se creó ningún usuario ni voto.`);
