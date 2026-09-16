import React,{useEffect,useMemo,useState,useSyncExternalStore} from 'react';
import {View,Text,ActivityIndicator,Platform} from 'react-native';
import Constants from 'expo-constants';
import {Asset} from 'expo-asset';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AppContext,type ContextValue} from '../data/AppProvider';
import {openDriver} from '../data/storage';
import {ClientRepo} from '../../../../packages/core/repository';
import {ApiClient,CloudService,SyncService} from '../../../../packages/core/api';
import {ScreenRouter} from '../screens/registry';
import {BackdropProvider} from '../ui/Backdrop';
import {Dock,art} from '../ui/components';
import {createVisualState,isVisualScene,visualBuildAllowed,FIXTURE_NOW,type VisualScene} from '../../../../packages/testing/visual-fixtures';

export function VisualReferenceScene({scene}:{scene:unknown}){
 const config=Constants.expoConfig;
 const enabled=visualBuildAllowed(config?.extra??{},Platform.OS==='android'?config?.android?.package??'':config?.ios?.bundleIdentifier??'');
 if(!enabled||!isVisualScene(scene))return <View style={{flex:1,backgroundColor:'#080D0C',justifyContent:'center',padding:24}}><Text style={{color:'#F4F6F3'}}>Referencia visual disponible únicamente en el binario aislado CUKI Visual, sin servicios remotos.</Text></View>;
 return <Fixture key={scene} scene={scene}/>;
}
function Fixture({scene}:{scene:VisualScene}){
 const [repo,setRepo]=useState<ClientRepo|null>(null),[error,setError]=useState<string|null>(null);
 const fixture=useMemo(()=>createVisualState(scene),[scene]);
 useEffect(()=>{
  let mounted=true;
  void(async()=>{
   const driver=await openDriver('cuki-reference-fixtures.sqlite');
   const r=await new ClientRepo(driver,fixture.state.accountId,fixture.state.profile.timezone).init();
   if(scene==='scan'){
    const photo=Asset.fromModule(art.bowl);await photo.downloadAsync();fixture.state.jobs[0].mediaUri=photo.localUri??photo.uri;
   }
   await r.mutate(s=>Object.assign(s,fixture.state));
   if(mounted)setRepo(r);
  })().catch(e=>{if(mounted)setError(e.message)});
  return()=>{mounted=false;};
 },[fixture,scene]);
 if(!repo)return <View style={{flex:1,backgroundColor:'#080D0C',alignItems:'center',justifyContent:'center'}}>{error?<Text style={{color:'#FFAAA4'}}>{error}</Text>:<ActivityIndicator/>}</View>;
 return <Ready repo={repo} scene={scene} screen={fixture.screen} params={fixture.params}/>;
}
function Ready({repo,scene,screen,params}:{repo:ClientRepo;scene:VisualScene;screen:string;params:Record<string,string>}){
 const state=useSyncExternalStore(repo.subscribe,repo.getSnapshot,repo.getSnapshot);
 const api=useMemo(()=>new ApiClient('',async()=>null),[]);
 const cloud=useMemo(()=>new CloudService(api,repo,async()=>{throw Error('Visual fixtures cannot upload or grant rewards.')}),[api,repo]);
 const query=useMemo(()=>new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}}),[]);
 useEffect(()=>()=>query.clear(),[query]);
 const value:ContextValue={state,repo,api,cloud,sync:new SyncService(api,repo),identity:null,clockOverride:Date.parse(FIXTURE_NOW),
  requestKey:(scope,body)=>repo.requestKey(scope,body),reloadIdentity:async()=>{throw Error('No identity in a visual fixture')},signOut:async()=>{}};
 return <QueryClientProvider client={query}><AppContext.Provider value={value}><BackdropProvider><View style={{flex:1,backgroundColor:'#080D0C'}} testID={'visual-scene-'+scene}><ScreenRouter screen={screen} params={params}/>{scene==='home'||scene==='recipes'?<Dock active={scene==='home'?'home':'recipes'}/>:null}</View></BackdropProvider></AppContext.Provider></QueryClientProvider>;
}
