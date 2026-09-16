import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVisualState,visualBuildAllowed,isVisualScene,VISUAL_SCENES,FIXTURE_SEED} from '../../packages/testing/visual-fixtures';
import {initialState} from '../../packages/core/state';
import {dayNutrition,recipeNutrition} from '../../packages/core/utils';
test('visual data requires dedicated package, explicit build flags and no remote providers',()=>{
 const extra={testMode:true,visualMode:true};assert.equal(visualBuildAllowed(extra,'com.cuki.app.visual'),true);
 for(const id of ['com.cuki.app','com.cuki.app.test',''])assert.equal(visualBuildAllowed(extra,id),false);
 for(const changes of [{testMode:false},{visualMode:false},{apiUrl:'http://127.0.0.1:3000'},{authUrl:'https://auth.invalid'},{revenueCatIos:'configured'},{revenueCatAndroid:'configured'}])assert.equal(visualBuildAllowed({...extra,...changes},'com.cuki.app.visual'),false);
});
test('ordinary guests never acquire visual foods, nutrition totals, plants or rewards',()=>{
 const state=initialState('guest','UTC');assert.equal(state.diary.length,0);assert.equal(state.garden,null);assert.equal(state.coins.length,0);assert.equal(state.jobs.length,0);assert.ok(state.foods.every(f=>!f.id.startsWith('visual-')));
});
test('six isolated deterministic scenarios select the actual production screen registry',()=>{
 assert.equal(VISUAL_SCENES.length,6);for(const scene of VISUAL_SCENES){assert.equal(isVisualScene(scene),true);const a=createVisualState(scene),b=createVisualState(scene);assert.deepEqual(a,b);assert.ok(a.screen.startsWith('SC-'));assert.equal(a.state.accountId,'visual-reference:'+scene);assert.deepEqual(a.state.outbox,[]);assert.deepEqual(a.state.coins,[]);assert.equal(a.state.entitlement.plan,'free');}
 assert.equal(isVisualScene('https://other.invalid'),false);
});
test('Home and recipe fixtures use the corrected arithmetic rather than incoherent mockup macros',()=>{
 const {state}=createVisualState('home'),sum=dayNutrition(state);assert.equal(sum.energy,1620);assert.equal(sum.protein,108);assert.equal(sum.carbs,189);assert.equal(sum.fat,48);
 const total=recipeNutrition(state.recipes[0],state.foods);assert.ok(Math.abs(total.energy!-520)<1e-8);assert.ok(Math.abs(total.fat!-16)<1e-8);assert.equal(total.protein,42);assert.equal(total.carbs,52);
});
test('Home week18 and Garden week38 retain the same seed and no redeemable fixture coin',()=>{
 const home=createVisualState('home').state,garden=createVisualState('garden').state;
 assert.equal(home.garden?.plant.seed,FIXTURE_SEED);assert.equal(garden.garden?.plant.seed,FIXTURE_SEED);assert.equal(home.garden?.creditedWeeks,18);assert.equal(garden.garden?.creditedWeeks,38);assert.equal(garden.garden?.state,'active');assert.equal(garden.coins.length,0);
});
