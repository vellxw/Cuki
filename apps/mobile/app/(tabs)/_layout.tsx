import React from 'react';
import {Tabs} from 'expo-router';
import {Dock,type TabName} from '../../src/ui/components';
import {useTheme} from '../../src/ui/theme';
export default function TabLayout(){
 const {c}=useTheme();
 return <Tabs screenOptions={{headerShown:false,sceneStyle:{backgroundColor:c.background},tabBarStyle:{position:'absolute'},lazy:true}} tabBar={({state,navigation})=><Dock active={state.routes[state.index].name as TabName} onSelect={name=>{
  const route=state.routes.find(r=>r.name===name);if(!route)return;
  const event=navigation.emit({type:'tabPress',target:route.key,canPreventDefault:true});
  if(!event.defaultPrevented&&state.routes[state.index].key!==route.key)navigation.navigate(route.name,route.params);
 }} onLongPress={name=>{const route=state.routes.find(r=>r.name===name);if(route)navigation.emit({type:'tabLongPress',target:route.key});}}/>}>
  <Tabs.Screen name="home" options={{title:'Hoy'}}/>
  <Tabs.Screen name="recipes" options={{title:'Recetas'}}/>
  <Tabs.Screen name="train" options={{title:'Entrenar'}}/>
  <Tabs.Screen name="progress" options={{title:'Progreso'}}/>
 </Tabs>;
}
