import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { screenIdentity, editorDraftKey } from '../../packages/core/navigation';
// Run the REAL reducer bundled with the SDK pinned by this app. This deliberately
// catches routing semantics that mocked router.push/dismissTo cannot validate.
const require = createRequire(import.meta.url);
const { StackRouter, StackActions } = require('expo-router/build/react-navigation/routers/StackRouter');
const dynamic = 'screen/[screenId]';
function stack() {
  const router = StackRouter({ initialRouteName: '(tabs)' });
  const options = { routeNames: ['(tabs)', dynamic, 'register'], routeParamList: {},
    routeGetIdList: { [dynamic]: ({ params }: {params: Record<string, unknown>}) => screenIdentity(dynamic, params) } };
  let state = router.getInitialState(options);
  return {
    get state() { return state; },
    push(params: Record<string, unknown>) { state = router.getStateForAction(state, StackActions.push(dynamic, params), options); },
    finish(params: Record<string, unknown>) { state = router.getStateForAction(state, StackActions.popTo(dynamic, params), options); },
    back() { state = router.getStateForAction(state, {type: 'GO_BACK'}, options); },
  };
}
test('returning from a recipe quantity reuses its real detail route; Back reaches the original tab', () => {
  const s = stack();
  s.push({screenId:'SC-26', id:'recipe-a'});
  const originalKey=s.state.routes.at(-1).key;
  s.push({screenId:'SC-12', recipeId:'recipe-a', servings:'0.5',returnTo:'/screen/SC-26?id=recipe-a'});
  s.finish({screenId:'SC-26', id:'recipe-a'});
  assert.equal(s.state.routes.length,2);
  assert.equal(s.state.routes.at(-1).key,originalKey);
  s.back(); assert.equal(s.state.routes.length,1); assert.equal(s.state.routes[0].name,'(tabs)');
});
test('two different recipes remain distinct history entries', () => {
  const s=stack();s.push({screenId:'SC-26',id:'a'}); const key=s.state.routes.at(-1).key;
  s.push({screenId:'SC-26',id:'b'});s.push({screenId:'SC-12',recipeId:'b'});
  s.finish({screenId:'SC-26',id:'b'});assert.equal(s.state.routes.length,3);
  s.back();assert.equal(s.state.routes.at(-1).params.id,'a');assert.equal(s.state.routes.at(-1).key,key);
});
test('repeated recipe registrations do not accumulate duplicate detail screens',()=>{
  const s=stack();s.push({screenId:'SC-26',id:'a'});
  for(let i=0;i<6;i++){s.push({screenId:'SC-12',recipeId:'a',servings:String(i+1)});s.finish({screenId:'SC-26',id:'a'});assert.equal(s.state.routes.length,2);}
});
test('new plan returns from exercise selection to its implicitly keyed draft',()=>{
  const s=stack();s.push({screenId:'SC-44'});const key=s.state.routes.at(-1).key;
  s.push({screenId:'SC-45',mode:'plan',draftKey:'plan-editor:new',dayId:'day-1'});
  s.finish({screenId:'SC-44',draftKey:'plan-editor:new'});
  assert.equal(s.state.routes.length,2);assert.equal(s.state.routes.at(-1).key,key);
});
test('an existing recipe editor and its ingredient editor retain their exact draft identities',()=>{
  const s=stack();s.push({screenId:'SC-32',id:'recipe-a'});const original=s.state.routes.at(-1).key;
  s.push({screenId:'SC-33',draftKey:'recipe-editor:recipe-a'});const ingredients=s.state.routes.at(-1).key;
  s.push({screenId:'SC-12',foodId:'rice',mode:'recipe',draftKey:'recipe-editor:recipe-a'});
  s.finish({screenId:'SC-33',draftKey:'recipe-editor:recipe-a'});
  assert.equal(s.state.routes.at(-1).key,ingredients);
  s.finish({screenId:'SC-32',draftKey:'recipe-editor:recipe-a'});
  assert.equal(s.state.routes.at(-1).key,original);assert.equal(s.state.routes.length,2);
});
test('rest and notes return to the original active workout without swallowing future Back',()=>{
  const s=stack();s.push({screenId:'SC-47',id:'workout-a'});const key=s.state.routes.at(-1).key;
  s.push({screenId:'SC-48',id:'workout-a'});
  s.finish({screenId:'SC-47',id:'workout-a',notificationWarning:'1'});
  assert.equal(s.state.routes.length,2);assert.equal(s.state.routes.at(-1).key,key);
});
test('quantity edits of different records do not alias; amounts and returnTo do not define identity',()=>{
  assert.notEqual(screenIdentity(dynamic,{screenId:'SC-12',entryId:'a'}),screenIdentity(dynamic,{screenId:'SC-12',entryId:'b'}));
  assert.equal(screenIdentity(dynamic,{screenId:'SC-12',entryId:'a',amount:'50',returnTo:'/home'}),screenIdentity(dynamic,{screenId:'SC-12',entryId:'a',amount:'100',returnTo:'/recipes'}));
});
test('route identity has no delimiter collisions and normalizes implicit draft keys',()=>{
  assert.notEqual(screenIdentity(dynamic,{screenId:'SC-26',id:'a,b'}),screenIdentity(dynamic,{screenId:'SC-26',id:'a',recipeId:'b'}));
  assert.equal(editorDraftKey('plan',{id:'p'}),'plan-editor:p');
  assert.equal(editorDraftKey('recipe',{}),'recipe-editor:new');
  assert.equal(editorDraftKey('recipe',{id:'old',draftKey:'explicit'}),'explicit');
});

test('registration return accepts only bounded internal screens and never an external deep link', async()=>{
  const {safeReturnHref,originHref}=await import('../../packages/core/navigation');
  for(const path of ['/recipes','/(tabs)/home','/screen/SC-26?id=recipe-a']) assert.equal(safeReturnHref(path),path);
  for(const path of ['https://phishing.invalid','//phishing.invalid','cuki://home','/screen/../admin','/screen/%53C-26','/screen/SC-26\\evil','/home\n','/home?'+ 'x'.repeat(4100)])assert.equal(safeReturnHref(path),null,path);
  assert.equal(originHref('/screen/SC-26',{screenId:'SC-26',id:'a',returnTo:'/home'}),'/screen/SC-26?id=a');
  assert.equal(originHref('/unknown',{id:'a'}),'/(tabs)/home');
});
test('finishing a logical root returns to the existing tab navigator, not a duplicate registry screen',()=>{
  const router=StackRouter({initialRouteName:'(tabs)'});
  const options={routeNames:['(tabs)',dynamic,'register'],routeParamList:{},routeGetIdList:{[dynamic]:({params}:any)=>screenIdentity(dynamic,params)}};
  let state=router.getInitialState(options);const key=state.routes[0].key;
  state=router.getStateForAction(state,StackActions.push(dynamic,{screenId:'SC-44'}),options);
  state=router.getStateForAction(state,StackActions.popTo('(tabs)',{screen:'train',params:{planId:'a'}}),options);
  assert.equal(state.routes.length,1);assert.equal(state.routes[0].key,key);assert.equal(state.routes[0].params.screen,'train');
});
