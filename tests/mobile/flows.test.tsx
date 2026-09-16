import {beforeEach, afterEach, expect, jest, test} from '@jest/globals';
import React, {useSyncExternalStore} from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import * as navigation from 'expo-router';
import {AppContext, type ContextValue} from '../../apps/mobile/src/data/AppProvider';
import {ClientRepo} from '../../packages/core/repository';
import {ApiClient, CloudService, SyncService} from '../../packages/core/api';
import {sqlite} from '../support/sqlite';
import {Portion, FoodSearch, FoodDetail, PhotoCapture} from '../../apps/mobile/src/screens/Foods';
import {ActiveWorkout, Rest, FinishWorkout, PlanEditor} from '../../apps/mobile/src/screens/Training';
import {createSession} from '../../packages/core/state';
import {entryFromFood, recipeNutrition} from '../../packages/core/utils';

jest.mock('expo-crypto', () => ({randomUUID: () => require('node:crypto').randomUUID()}));
jest.mock('../../apps/mobile/src/data/storage', () => ({getDriver: () => { throw Error('Native driver is not exercised in component tests'); }}));
jest.mock('../../apps/mobile/src/data/auth', () => ({restoreSession: jest.fn(), identityOf: () => null}));
jest.mock('../../apps/mobile/src/native/io', () => ({choosePhoto: jest.fn(), normalizePhoto: jest.fn(), exportText: jest.fn(), uploadMedia: jest.fn()}));
jest.mock('../../apps/mobile/src/native/notifications', () => ({scheduleRest: jest.fn(), cancelRest: jest.fn()}));
jest.mock('../../apps/mobile/src/ui/Plant', () => ({Plant: () => null, PlantLite: () => null}));
jest.mock('expo-camera', () => ({CameraView: require('react-native').View, useCameraPermissions: () => [{granted: false, canAskAgain: true}, jest.fn()]}));

let disk: ReturnType<typeof sqlite>, repo: ClientRepo, queryClient: QueryClient;
let mockParams: Record<string, string> = {};
beforeEach(async () => {
  disk = sqlite(); repo = await new ClientRepo(disk.driver, 'guest', 'UTC').init();
  mockParams = {};
  jest.spyOn(require('expo-router'), 'useLocalSearchParams').mockImplementation(() => mockParams);
  queryClient = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}});
});
afterEach(() => { cleanup(); queryClient.clear(); disk.close(); });
function Harness({children}: {children: React.ReactNode}) {
  const state = useSyncExternalStore(repo.subscribe, repo.getSnapshot, repo.getSnapshot);
  const api = new ApiClient('', async () => null);
  const cloud = new CloudService(api, repo, async () => {throw Error('No external service in test');});
  const value: ContextValue = {state, repo, api, cloud, sync: new SyncService(api, repo), identity: null,
    requestKey: (scope, value) => repo.requestKey(scope, value), reloadIdentity: async () => {}, signOut: async () => {}};
  return <QueryClientProvider client={queryClient}><AppContext.Provider value={value}>{children}</AppContext.Provider></QueryClientProvider>;
}
function show(element: React.ReactElement, params: Record<string,string> = {}) {
  mockParams = params;
  return render(<Harness>{element}</Harness>);
}
test('food search opens the selected source and source opens quantity, without logging early', () => {
  const r = show(<FoodSearch params={{returnTo: '/recipes'}}/>);
  const food = repo.getSnapshot().foods.find(f => f.name.includes('Pechuga'))!;
  fireEvent.changeText(screen.getByLabelText('Alimento o ingrediente'), 'Pechuga');
  fireEvent.press(screen.getByRole('button', {name: food.name}));
  expect(navigation.router.push).toHaveBeenLastCalledWith(expect.objectContaining({params: expect.objectContaining({screenId:'SC-11',foodId:food.id})}));
  r.rerender(<Harness><FoodDetail params={{foodId:food.id, returnTo:'/recipes'}}/></Harness>);
  fireEvent.press(screen.getByTestId('food-portion'));
  expect(navigation.router.push).toHaveBeenLastCalledWith(expect.objectContaining({params: expect.objectContaining({screenId:'SC-12',foodId:food.id,returnTo:'/recipes'})}));
  expect(repo.getSnapshot().diary).toHaveLength(0);
});
test('quantity is saved durably before returning to its exact source context', async () => {
  const food = repo.getSnapshot().foods[0], params = {foodId:food.id,returnTo:'/recipes?q=pollo'};
  show(<Portion params={params}/>,params);
  fireEvent.changeText(screen.getByTestId('portion-amount'),'125,5');
  fireEvent.press(screen.getByTestId('portion-save'));
  await waitFor(() => expect(repo.getSnapshot().diary).toHaveLength(1));
  await waitFor(() => expect(navigation.router.dismissTo).toHaveBeenCalledWith('/recipes?q=pollo'));
  const reopened = await new ClientRepo(disk.driver,'guest','UTC').init();
  expect(reopened.getSnapshot().diary[0].amount).toBe(125.5);
  expect(reopened.getSnapshot().diary[0].nutrition.energy).toBeCloseTo(food.nutrients.energy!*1.255);
});
test('a corrected recipe portion uses its original source snapshot and does not duplicate', async () => {
  const recipe = repo.getSnapshot().recipes[0], params = {recipeId:recipe.id,servings:'0.5'};
  const r=show(<Portion params={params}/>,params);
  fireEvent.press(screen.getByTestId('portion-save'));
  await waitFor(()=>expect(repo.getSnapshot().diary).toHaveLength(1));
  const saved=repo.getSnapshot().diary[0];
  expect(saved.nutrition.energy).toBeCloseTo(recipeNutrition(recipe,repo.getSnapshot().foods).energy!*.5);
  r.unmount();
  show(<Portion params={{entryId:saved.id}}/>);
  fireEvent.changeText(screen.getByTestId('portion-amount'),'0.75');
  fireEvent.press(screen.getByTestId('portion-save'));
  await waitFor(()=>expect(repo.getSnapshot().diary[0].version).toBe(2));
  expect(repo.getSnapshot().diary).toHaveLength(1); expect(repo.getSnapshot().diary[0].amount).toBe(.75);
});
test('invalid quantity leaves storage unchanged and does not navigate', async () => {
  show(<Portion params={{foodId:repo.getSnapshot().foods[0].id}}/>);
  fireEvent.changeText(screen.getByTestId('portion-amount'),'-20');
  fireEvent.press(screen.getByTestId('portion-save'));
  expect(repo.getSnapshot().diary).toHaveLength(0);expect(navigation.router.dismissTo).not.toHaveBeenCalled();
});
test('completing a set persists values and rest deadline before opening the rest screen', async () => {
  const session=createSession(repo.getSnapshot(),undefined,0,[repo.getSnapshot().exercises[0].id]);
  await repo.dispatch({type:'startSession',session});
  show(<ActiveWorkout params={{id:session.id}}/>);
  fireEvent.changeText(screen.getByLabelText('Carga kg'),'20');
  fireEvent.changeText(screen.getByLabelText('Repeticiones'),'8');
  fireEvent.press(screen.getByRole('button',{name:'Completar serie'}));
  await waitFor(()=>expect(repo.getSnapshot().sessions[0].exercises[0].sets[0].completedAt).toBeTruthy());
  const reopened=await new ClientRepo(disk.driver,'guest','UTC').init();
  expect(reopened.getSnapshot().sessions[0].restDeadline).toBeGreaterThan(Date.now());
  expect(reopened.getSnapshot().sessions[0].exercises[0].sets[0].reps).toBe(8);
  await waitFor(()=>expect(navigation.router.push).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({screenId:'SC-48',id:session.id})})));
});
