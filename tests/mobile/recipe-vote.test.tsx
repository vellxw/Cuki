import {afterEach,beforeEach,expect,jest,test} from '@jest/globals';
import React,{useSyncExternalStore} from 'react';
import {cleanup,render,screen,fireEvent,waitFor,act} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import * as navigation from 'expo-router';
import {AppContext,type ContextValue} from '../../apps/mobile/src/data/AppProvider';
import {RecipeVote} from '../../apps/mobile/src/ui/RecipeVote';
import {ClientRepo} from '../../packages/core/repository';
import {ApiClient,CloudService,SyncService} from '../../packages/core/api';
import type {Recipe} from '../../packages/core/types';
import {sqlite} from '../support/sqlite';
jest.mock('expo-crypto',()=>({randomUUID:()=>require('node:crypto').randomUUID()}));
jest.mock('../../apps/mobile/src/data/storage',()=>({getDriver:()=>{throw Error('No platform driver in component tests')}}));
jest.mock('../../apps/mobile/src/data/auth',()=>({restoreSession:jest.fn(),identityOf:()=>null}));
jest.mock('../../apps/mobile/src/native/io',()=>({uploadMedia:jest.fn()}));
let disk:ReturnType<typeof sqlite>,repo:ClientRepo,api:ApiClient,query:QueryClient;
let identity:ContextValue['identity']=null,recipe:Recipe;
beforeEach(async()=>{
  disk=sqlite();repo=await new ClientRepo(disk.driver,'guest','UTC').init();
  identity=null;api=new ApiClient('',async()=>null);
  query=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  recipe={...repo.getSnapshot().recipes[0],upvotes:15};
  jest.spyOn(require('expo-router'),'useLocalSearchParams').mockReturnValue({});
});
afterEach(()=>{cleanup();query.clear();disk.close()});
function Harness({children}:{children:React.ReactNode}){
  const state=useSyncExternalStore(repo.subscribe,repo.getSnapshot,repo.getSnapshot);
  const value:ContextValue={state,repo,api,identity,cloud:new CloudService(api,repo,async()=>{throw Error('Fixture only')}),
    sync:new SyncService(api,repo),requestKey:(scope,body)=>repo.requestKey(scope,body),reloadIdentity:async()=>{},signOut:async()=>{}};
  return <QueryClientProvider client={query}><AppContext.Provider value={value}>{children}</AppContext.Provider></QueryClientProvider>;
}
function show(){return render(<Harness><RecipeVote recipe={recipe}/></Harness>)}
async function verified(){identity={userId:'verified-account',email:'fixture@example.invalid',verified:true};repo=await new ClientRepo(disk.driver,identity.userId,'UTC').init()}
test('guest and unverified users keep exploration but cannot create a supposedly confirmed vote',async()=>{
  const view=show();fireEvent.press(screen.getByTestId('recipe-vote-'+recipe.id));
  expect(navigation.router.push).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({screenId:'SC-03'})}));
  expect(repo.getSnapshot().votedRecipeIds).toHaveLength(0);
  identity={userId:'unverified',email:'fixture@example.invalid',verified:false};
  view.rerender(<Harness><RecipeVote recipe={recipe}/></Harness>);
  fireEvent.press(screen.getByTestId('recipe-vote-'+recipe.id));
  expect(repo.getSnapshot().votedRecipeIds).toHaveLength(0);
});
test('an offline verified vote persists immediately, without inventing another aggregate vote',async()=>{
  await verified();show();fireEvent.press(screen.getByTestId('recipe-vote-'+recipe.id));
  await waitFor(()=>expect(repo.getSnapshot().votedRecipeIds).toEqual([recipe.id]));
  expect(screen.getByTestId('recipe-vote-'+recipe.id).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('15')).toBeTruthy();expect(screen.queryByText('16')).toBeNull();
  expect(screen.getByTestId('recipe-vote-'+recipe.id).props.accessibilityHint).toMatch(/pendiente/);
  const reopened=await new ClientRepo(disk.driver,identity!.userId,'UTC').init();
  expect(reopened.getSnapshot().votedRecipeIds).toEqual([recipe.id]);
  expect(reopened.getSnapshot().outbox.filter(o=>o.entityType==='votedRecipeIds')).toHaveLength(1);
});
test('rapid duplicate taps do not undo a vote while its durable write is still pending',async()=>{
  await verified();show();const button=screen.getByTestId('recipe-vote-'+recipe.id);
  fireEvent.press(button);fireEvent.press(button);
  await waitFor(()=>expect(repo.getSnapshot().votedRecipeIds).toEqual([recipe.id]));
  expect(repo.getSnapshot().outbox.filter(o=>o.entityType==='votedRecipeIds')).toHaveLength(1);
});
test('after acknowledgement the count is read from the server, not incremented speculatively',async()=>{
  await verified();api=new ApiClient('https://fixture.invalid',async()=>null);
  let total=15;
  const request=jest.spyOn(api,'request').mockImplementation(async()=>({...recipe,upvotes:total}));
  show();await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByTestId('recipe-vote-'+recipe.id));
  await waitFor(()=>expect(repo.getSnapshot().votedRecipeIds).toHaveLength(1));
  const op=repo.getSnapshot().outbox.find(o=>o.entityType==='votedRecipeIds')!;
  total=18;
  await act(async()=>repo.acceptSync([{id:op.id,state:'accepted'}],[],'1'));
  await waitFor(()=>expect(screen.getByText('18')).toBeTruthy());
  expect(request).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('recipe-vote-'+recipe.id).props.accessibilityHint).not.toMatch(/pendiente/);
});
test('a private recipe is not votable and never fetches a public aggregate',()=>{
  api=new ApiClient('https://fixture.invalid',async()=>null);const spy=jest.spyOn(api,'request');
  recipe={...recipe,visibility:'private'};show();
  expect(screen.queryByTestId('recipe-vote-'+recipe.id)).toBeNull();expect(spy).not.toHaveBeenCalled();
});
test('unknown or invalid totals stay unknown instead of zero or an invented success',async()=>{
  recipe={...recipe,upvotes:undefined};api=new ApiClient('https://fixture.invalid',async()=>null);
  jest.spyOn(api,'request').mockResolvedValue({...recipe,upvotes:-100});
  show();await waitFor(()=>expect(screen.getByTestId('recipe-vote-'+recipe.id).props.accessibilityHint).toMatch(/No se pudo actualizar/));
  expect(screen.getByText('Votar')).toBeTruthy();expect(screen.queryByText('0')).toBeNull();
});
