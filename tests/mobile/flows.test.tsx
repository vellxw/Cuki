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
import {Home} from '../../apps/mobile/src/screens/Home';
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

test('exercise detail starts exactly the chosen exercise without sending the user back to the library', async () => {
  const {ExerciseDetail} = require('../../apps/mobile/src/screens/Training');
  const exercise=repo.getSnapshot().exercises[1];
  show(<ExerciseDetail params={{id:exercise.id}}/>);
  fireEvent.press(screen.getByRole('button',{name:'Iniciar sesión libre con este ejercicio'}));
  await waitFor(()=>expect(repo.getSnapshot().sessions).toHaveLength(1));
  expect(repo.getSnapshot().sessions[0].exercises[0].exerciseId).toBe(exercise.id);
  const reopened=await new ClientRepo(disk.driver,'guest','UTC').init();
  expect(reopened.getSnapshot().sessions[0].exercises[0].exerciseId).toBe(exercise.id);
  await waitFor(()=>expect(navigation.router.replace).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({screenId:'SC-47'})})));
});

test('creating two custom exercises on the same screen cannot overwrite the first exercise', async () => {
  const {ExerciseLibrary} = require('../../apps/mobile/src/screens/Training');
  show(<ExerciseLibrary params={{}}/>);
  for(const name of ['Ejercicio personal uno','Ejercicio personal dos']) {
    fireEvent.press(screen.getByRole('button',{name:'Crear ejercicio personalizado'}));
    await waitFor(()=>expect(screen.getByLabelText('Nombre del ejercicio').props.value).toBe(''));
    fireEvent.changeText(screen.getByLabelText('Nombre del ejercicio'),name);
    await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar ejercicio'}).props.accessibilityState?.disabled).not.toBe(true));
    await act(async()=>{ await fireEvent.press(screen.getByRole('button',{name:'Guardar ejercicio'})); });
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Guardar ejercicio'})).toBeNull());
    await waitFor(()=>expect(repo.getSnapshot().exercises.some(e=>e.name===name)).toBe(true));
  }
  const reopened=await new ClientRepo(disk.driver,'guest','UTC').init();
  const custom=reopened.getSnapshot().exercises.filter(e=>e.custom);
  expect(custom.map(e=>e.name).sort()).toEqual(['Ejercicio personal dos','Ejercicio personal uno']);
  expect(new Set(custom.map(e=>e.id)).size).toBe(2);
});

async function completedSetWithNotification() {
  const session=createSession(repo.getSnapshot(),undefined,0,[repo.getSnapshot().exercises[0].id]);
  await repo.dispatch({type:'startSession',session});
  const exercise=repo.getSnapshot().sessions[0].exercises[0];
  await repo.dispatch({type:'set',sessionId:session.id,exerciseId:exercise.id,set:{...exercise.sets[0],load:20,reps:8},complete:true});
  await repo.dispatch({type:'notification',sessionId:session.id,notificationId:'test-os-notification'});
  return session.id;
}

test('a failed OS cancellation does not trap the user in rest after its deadline was cleared', async () => {
  const id=await completedSetWithNotification();
  const {cancelRest}=require('../../apps/mobile/src/native/notifications');
  cancelRest.mockRejectedValueOnce(new Error('Notifications service unavailable'));
  show(<Rest params={{id}}/>);
  fireEvent.press(screen.getByRole('button',{name:'Continuar entrenamiento'}));
  await waitFor(()=>expect(repo.getSnapshot().sessions[0].restDeadline).toBeNull());
  await waitFor(()=>expect(navigation.router.dismissTo).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({screenId:'SC-47',notificationWarning:'1'})})));
  expect(repo.getSnapshot().sessions[0].restNotificationId).toBe('test-os-notification');
  expect(repo.getSnapshot().sessions[0].exercises[0].sets[0].completedAt).toBeTruthy();
});

test('finishing a saved workout still reaches summary when the OS cannot cancel its notification', async () => {
  const id=await completedSetWithNotification();
  const {cancelRest}=require('../../apps/mobile/src/native/notifications');
  cancelRest.mockRejectedValueOnce(new Error('Notifications service unavailable'));
  show(<FinishWorkout params={{id}}/>);
  fireEvent.changeText(screen.getByLabelText('Cómo fue la sesión, opcional'),'Sesión conservada');
  fireEvent.press(screen.getByRole('button',{name:'Guardar y finalizar sesión'}));
  await waitFor(()=>expect(repo.getSnapshot().sessions[0].status).toBe('completed'));
  await waitFor(()=>expect(navigation.router.replace).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({screenId:'SC-52',notificationWarning:'1'})})));
  const reopened=await new ClientRepo(disk.driver,'guest','UTC').init();
  expect(reopened.getSnapshot().sessions[0].note).toBe('Sesión conservada');
  expect(reopened.getSnapshot().sessions[0].restDeadline).toBeNull();
});

test('successful notification cancellation is persisted when continuing after process recreation', async () => {
  const id=await completedSetWithNotification();
  repo=await new ClientRepo(disk.driver,'guest','UTC').init();
  show(<Rest params={{id}}/>);
  fireEvent.press(screen.getByRole('button',{name:'Continuar entrenamiento'}));
  await waitFor(()=>expect(repo.getSnapshot().sessions[0].restNotificationId).toBeNull());
  expect(repo.getSnapshot().sessions[0].exercises[0].sets[0].reps).toBe(8);
  const reopened=await new ClientRepo(disk.driver,'guest','UTC').init();
  expect(reopened.getSnapshot().sessions[0].restDeadline).toBeNull();
  expect(reopened.getSnapshot().sessions[0].restNotificationId).toBeNull();
});

async function seedPlanDraft() {
  const {newPlanDraft}=require('../../apps/mobile/src/screens/drafts');
  const draft=newPlanDraft(); draft.name='Rutina con decimales';
  draft.days[0].exercises=[{id:'plan-exercise-qa',exerciseId:repo.getSnapshot().exercises[0].id,
    sets:3,repsMin:8,repsMax:12,restSeconds:90,load:null,superset:null}];
  await repo.dispatch({type:'draft',key:'plan-editor:new',value:draft});
  return draft;
}
test('plan editor preserves a comma while typing and its decimal load across remount and save',async()=>{
  await seedPlanDraft();
  const mounted=show(<PlanEditor params={{}}/>);
  for(const text of ['7','72','72,','72,5']) {
    await act(async()=>{fireEvent.changeText(screen.getByLabelText('Carga inicial kg, ejercicio 1'),text)});
    await waitFor(()=>expect(screen.getByLabelText('Carga inicial kg, ejercicio 1').props.value).toBe(text));
  }
  mounted.unmount();repo=await new ClientRepo(disk.driver,'guest','UTC').init();
  show(<PlanEditor params={{}}/>);
  expect(screen.getByLabelText('Carga inicial kg, ejercicio 1').props.value).toBe('72,5');
  fireEvent.press(screen.getByRole('button',{name:'Guardar plan'}));
  await waitFor(()=>expect(repo.getSnapshot().plans).toHaveLength(1));
  expect(repo.getSnapshot().plans[0].days[0].exercises[0].load).toBe(72.5);
  expect(repo.getSnapshot().plans[0]).not.toHaveProperty('numericInputs');
});
test('an empty required plan number remains editable and cannot silently save its former value',async()=>{
  await seedPlanDraft();show(<PlanEditor params={{}}/>);
  await act(async()=>{fireEvent.changeText(screen.getByLabelText('Series, ejercicio 1'),'')});
  expect(screen.getByLabelText('Series, ejercicio 1').props.value).toBe('');
  fireEvent.press(screen.getByRole('button',{name:'Guardar plan'}));
  await waitFor(()=>expect(screen.getByText(/Series, ejercicio 1.*Ingresá un número válido/)).toBeTruthy());
  expect(repo.getSnapshot().plans).toHaveLength(0);
  expect(navigation.router.replace).not.toHaveBeenCalled();
  await act(async()=>{fireEvent.changeText(screen.getByLabelText('Series, ejercicio 1'),'4')});
  fireEvent.press(screen.getByRole('button',{name:'Guardar plan'}));
  await waitFor(()=>expect(repo.getSnapshot().plans).toHaveLength(1));
  expect(repo.getSnapshot().plans[0].days[0].exercises[0].sets).toBe(4);
});

test('Home preserves real empty data, contextual logging and optional goals without invented progress',()=>{
 show(<Home/>);
 expect(screen.getByText('Tu historia empieza con una semilla')).toBeTruthy();
 expect(screen.queryByText('Semana 18 de 52')).toBeNull();
 const bars=screen.getAllByRole('progressbar');
 expect(bars).toHaveLength(3);for(const bar of bars)expect(bar.props.accessibilityValue).toBeUndefined();
 fireEvent.press(screen.getByTestId('home-register'));
 expect(navigation.router.push).toHaveBeenCalledWith(expect.objectContaining({pathname:'/register'}));
 fireEvent.press(screen.getByRole('button',{name:'Configurar metas opcionales'}));
 expect(navigation.router.push).toHaveBeenLastCalledWith(expect.objectContaining({params:expect.objectContaining({screenId:'SC-04'})}));
});
test('Home macro progress uses actual amounts and the effective goal, not decorative filled bars',async()=>{
 await repo.dispatch({type:'goal',goal:{id:'home-goal',version:1,effectiveFrom:repo.getSnapshot().selectedDate,energy:2000,protein:150,carbs:200,fat:60}});
 show(<Home/>);
 const bars=screen.getAllByRole('progressbar');expect(bars.map(b=>b.props.accessibilityValue.now)).toEqual([0,0,0]);
 expect(bars.map(b=>b.props.accessibilityValue.max)).toEqual([150,200,60]);
 expect(screen.queryByRole('button',{name:'Configurar metas opcionales'})).toBeNull();
});
