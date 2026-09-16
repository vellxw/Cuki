import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';import {Text,View,ActivityIndicator,AppState as NativeAppState} from 'react-native';import Constants from 'expo-constants';import * as Crypto from 'expo-crypto';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ClientRepo} from '../../../../packages/core/repository';import {ApiClient,CloudService,SyncService} from '../../../../packages/core/api';import type {AppState} from '../../../../packages/core/types';import {configureUUID,invariant} from '../../../../packages/core/utils';import {getDriver} from './storage';import * as auth from './auth';import {uploadMedia} from '../native/io';
import * as Network from 'expo-network';
import {SyncCoordinator} from '../../../../packages/core/sync-coordinator';
import {PersistentDraft} from '../../../../packages/core/draft';
configureUUID(()=>Crypto.randomUUID());
const queryClient=new QueryClient({defaultOptions:{queries:{retry:1,staleTime:30000},mutations:{retry:false}}});
export interface ContextValue {clockOverride?:number;state:AppState;repo:ClientRepo;api:ApiClient;cloud:CloudService;sync:SyncService;syncCoordinator?:SyncCoordinator;identity:auth.Identity|null;requestKey:(scope:string,body:unknown)=>Promise<string>;reloadIdentity:(mergeGuest?:boolean)=>Promise<void>;signOut:()=>Promise<void>}
export const AppContext=createContext<ContextValue|null>(null);
const Context=AppContext;
export function useApp(){const c=useContext(Context);if(!c)throw new Error('CUKI data provider not ready');return c}
export function AppProvider({children}:{children:React.ReactNode}){const [repo,setRepo]=useState<ClientRepo|null>(null);const [identity,setIdentity]=useState<auth.Identity|null>(null);const [error,setError]=useState('');const repoRef=useRef<ClientRepo|null>(null);const generation=useRef(0);
 const select=useCallback(async(next:auth.Identity|null,mergeGuest=false)=>{const epoch=++generation.current;const previous=repoRef.current;await queryClient.cancelQueries();queryClient.clear();const driver=await getDriver();const r=await new ClientRepo(driver,next?.userId??'guest',Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC').init();if(mergeGuest&&previous?.accountId==='guest'&&next)await r.mergeGuest(previous.getSnapshot());if(epoch!==generation.current)return;repoRef.current=r;setIdentity(next);setRepo(r)},[]);
 useEffect(()=>{auth.restoreSession().then(next=>select(next)).catch(e=>setError((e as Error).message));return()=>{generation.current++}},[select]);
 const reloadIdentity=useCallback(async(mergeGuest=false)=>select(auth.identityOf(),mergeGuest),[select]);
 const signOut=useCallback(async()=>{generation.current++;await auth.logout();await select(null)},[select]);
 if(!repo)return <View style={{flex:1,backgroundColor:'#080D0C',alignItems:'center',justifyContent:'center',padding:30}}><ActivityIndicator color="#92E8B5"/><Text style={{color:'#F4F6F3',marginTop:20}}>{error||'Preparando tu espacio…'}</Text>{error?<Text accessibilityRole="button" style={{color:'#92E8B5',marginTop:20}} onPress={()=>{setError('');void select(null).catch(e=>setError(e.message))}}>Reintentar sin borrar los datos</Text>:null}</View>;
 return <QueryClientProvider client={queryClient}><ReadyProvider key={repo.accountId} repo={repo} identity={identity} reloadIdentity={reloadIdentity} signOut={signOut}>{children}</ReadyProvider></QueryClientProvider>
}
function ReadyProvider({repo,identity,reloadIdentity,signOut,children}:{repo:ClientRepo;identity:auth.Identity|null;reloadIdentity:ContextValue['reloadIdentity'];signOut:()=>Promise<void>;children:React.ReactNode}){const state=useSyncExternalStore(repo.subscribe,repo.getSnapshot,repo.getSnapshot);const api=useMemo(()=>new ApiClient(String(Constants.expoConfig?.extra?.apiUrl??''),async()=>{const token=await auth.accessToken();invariant((auth.identityOf()?.userId??'guest')===repo.accountId,'La cuenta cambió; no se enviaron datos de otra cuenta.');return token},auth.authEpoch),[repo]);const cloud=useMemo(()=>new CloudService(api,repo,(uri,purpose)=>uploadMedia(api,uri,purpose)),[api,repo]);const sync=useMemo(()=>new SyncService(api,repo),[api,repo]);
 const syncCoordinator=useMemo(()=>new SyncCoordinator(repo,async signal=>{await sync.sync(signal);await cloud.refreshGarden(signal);await cloud.refreshEntitlement(signal)}),[repo,sync,cloud]);
 useEffect(()=>{
  if(!identity||!api.configured)return;
  let current=true;
  syncCoordinator.setForeground(NativeAppState.currentState==='active'||NativeAppState.currentState===null);
  const net=(value:Network.NetworkState)=>syncCoordinator.setOnline(value.isConnected!==false&&value.isInternetReachable!==false);
  const appSub=NativeAppState.addEventListener('change',value=>syncCoordinator.setForeground(value==='active'));
  const netSub=Network.addNetworkStateListener(net);
  void Network.getNetworkStateAsync().then(value=>{if(current)net(value)}).catch(()=>{});
  syncCoordinator.start();
  return()=>{current=false;appSub.remove();netSub.remove();syncCoordinator.stop()};
 },[identity,api,syncCoordinator]);

 const value=useMemo(()=>({state,repo,api,cloud,sync,syncCoordinator,identity,requestKey:(scope:string,body:unknown)=>repo.requestKey(scope,body),reloadIdentity,signOut}),[state,repo,api,cloud,sync,syncCoordinator,identity,reloadIdentity,signOut]);return <Context.Provider value={value}>{children}</Context.Provider>}
export function useTask(){const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);const mounted=useRef(true),active=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);const run=useCallback(async<T,>(fn:()=>Promise<T>|T):Promise<T|undefined>=>{if(active.current)return;active.current=true;if(mounted.current){setBusy(true);setError(null)}try{return await fn()}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'No se pudo completar.');return undefined}finally{active.current=false;if(mounted.current)setBusy(false)}},[]);return{busy,error,run,clearError:()=>setError(null)}}
export function useDraft<T extends object>(key:string,initial:()=>T){
 const {repo}=useApp();
 // The initial factory is consulted only when the account or draft key changes.
 const draft=useMemo(()=>new PersistentDraft(repo,key,initial),[repo,key]);
 const {value,error}=useSyncExternalStore(draft.subscribe,draft.getSnapshot,draft.getSnapshot);
 return{key,value,set:draft.set,flush:draft.flush,error};
}
