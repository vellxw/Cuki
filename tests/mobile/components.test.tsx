import {jest,beforeEach,test,expect} from '@jest/globals';
import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {Button, MacroRow, Ring, Field, Dock, Screen, Txt, Chips} from '../../apps/mobile/src/ui/components';
import {initialState} from '../../packages/core/state';
import {router} from 'expo-router';
jest.mock('../../apps/mobile/src/data/AppProvider',()=>({useApp:()=>({state:mockState,api:{configured:false},identity:null})}));
let mockState=initialState('guest','UTC','2026-09-15T12:00:00Z');
beforeEach(()=>{mockState=initialState('guest','UTC','2026-09-15T12:00:00Z');});
test('primary action dispatches once per press and is labelled',()=>{
 const action=jest.fn();render(<Button title="Registrar comida" onPress={action}/>);
 fireEvent.press(screen.getByRole('button',{name:'Registrar comida'}));expect(action).toHaveBeenCalledTimes(1);
});
test('a disabled primary action cannot execute',()=>{
 const action=jest.fn();render(<Button title="Guardar" onPress={action} disabled/>);
 fireEvent.press(screen.getByRole('button',{name:'Guardar'}));expect(action).not.toHaveBeenCalled();
});
test('ring keeps text and accessible value for a missing goal',()=>{
 render(<Ring value={null} goal={null}/>);expect(screen.getByText('—')).toBeTruthy();expect(screen.getByText('kcal registradas')).toBeTruthy();
});
test('macros respect calorie visibility without hiding nutrients',()=>{
 mockState.profile.showCalories=false;render(<MacroRow nutrients={{energy:400,protein:32,carbs:45,fat:10,fiber:null,sugar:null,sodium:null}}/>);
 expect(screen.queryByText('400 kcal')).toBeNull();expect(screen.getByText('P 32 g')).toBeTruthy();
});
test('field presents its label and forwards corrected decimal input',()=>{
 const change=jest.fn();render(<Field label="Cantidad" value="100" onChangeText={change}/>);
 fireEvent.changeText(screen.getByLabelText('Cantidad'),'72,5');expect(change).toHaveBeenCalledWith('72,5');
});
test('central registration is an action, not a fifth tab destination',()=>{
 render(<Dock active="recipes"/>);fireEvent.press(screen.getByTestId('nav-register'));
 expect(router.push).toHaveBeenCalledWith({pathname:'/register',params:{returnTo:'/recipes'}});
});

test('only the navigator owns the dock, even on tab root screens',()=>{
 render(<Screen back={false} tab="home"><Txt>Home content</Txt></Screen>);
 expect(screen.getByText('Home content')).toBeTruthy();expect(screen.queryByTestId('cuki-dock')).toBeNull();
});
test('tab selection uses the tab navigator callback rather than a stack dismissal',()=>{
 const select=jest.fn();render(<Dock active="home" onSelect={select}/>);
 fireEvent.press(screen.getByRole('tab',{name:'Recetas'}));expect(select).toHaveBeenCalledWith('recipes');expect(router.dismissTo).not.toHaveBeenCalled();
});
test('fallback tab selection navigates without popping its containing stack',()=>{
 render(<Dock active="home"/>);fireEvent.press(screen.getByTestId('nav-train'));
 expect(router.navigate).toHaveBeenCalledWith('/(tabs)/train');expect(router.dismissTo).not.toHaveBeenCalled();
});
test('dock has a nonzero hit-tested parent and five unique targets',()=>{
 render(<Dock active="recipes"/>);const style=require('react-native').StyleSheet.flatten(screen.getByTestId('cuki-dock').props.style);
 expect(style.height).toBeGreaterThan(80);for(const name of ['home','recipes','register','train','progress'])expect(screen.getAllByTestId('nav-'+name)).toHaveLength(1);
});

// Horizontal ScrollView defaults to flexGrow:1. In a short exercise results list
// this used to turn filter chips into ~380dp-tall columns on Android.
test('filter chips remain intrinsic-height and do not consume vertical free space',()=>{
 const onChange=jest.fn();render(<Chips options={[{value:'all',label:'Todos'},{value:'chest',label:'Pecho'}]} value="all" onChange={onChange}/>);
 const rn=require('react-native');const scroll=screen.UNSAFE_getByType(rn.ScrollView);
 expect(rn.StyleSheet.flatten(scroll.props.style)).toEqual(expect.objectContaining({flexGrow:0,flexShrink:0}));
 expect(scroll.props.contentContainerStyle.alignItems).toBe('center');
 expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
 fireEvent.press(screen.getByRole('button',{name:'Pecho'}));expect(onChange).toHaveBeenCalledWith('chest');
});

test('logical training root uses the existing tabs so the dock is not lost after editing a plan',()=>{
 function Fixture(){const nav=require('../../apps/mobile/src/ui/components').useNav();return <Button title="Terminar editor" onPress={()=>nav.replace('SC-42',{planId:'plan-a'})}/>;}
 render(<Fixture/>);fireEvent.press(screen.getByRole('button',{name:'Terminar editor'}));
 expect(router.dismissTo).toHaveBeenCalledWith({pathname:'/(tabs)/train',params:{planId:'plan-a'}});
 expect(router.replace).not.toHaveBeenCalled();expect(router.push).not.toHaveBeenCalled();
});

// Material tests exercise selection/fallback and semantics, not pixel fidelity.
test('native liquid glass is selected only when both APIs are available',()=>{
 const rn=require('react-native'),glass=require('expo-glass-effect');
 const old=rn.Platform.OS;rn.Platform.OS='ios';
 const a=jest.spyOn(glass,'isLiquidGlassAvailable').mockReturnValue(true);
 const b=jest.spyOn(glass,'isGlassEffectAPIAvailable').mockReturnValue(true);
 try {
  const Glass=require('../../apps/mobile/src/ui/components').Glass;
  render(<Glass strong><Txt>Contenido real</Txt></Glass>);
  expect(screen.getByTestId('material-native-glass').props.glassEffectStyle).toBe('clear');
  expect(screen.getByText('Contenido real')).toBeTruthy();
  expect(screen.queryByTestId('material-blurred-glass')).toBeNull();
 }finally{a.mockRestore();b.mockRestore();rn.Platform.OS=old;}
});
test('reduced transparency uses a stable opaque material rather than hiding content',()=>{
 mockState.profile.reduceTransparency=true;
 const Glass=require('../../apps/mobile/src/ui/components').Glass;
 render(<Glass strong><Txt>Contenido accesible</Txt></Glass>);
 expect(screen.getByTestId('material-opaque')).toBeTruthy();
 expect(screen.queryByTestId('material-native-glass')).toBeNull();
 expect(screen.queryByTestId('material-blurred-glass')).toBeNull();
 expect(screen.getByText('Contenido accesible')).toBeTruthy();
});
test('the nutrition SVG supplies an explicit viewBox independent of the device scale',()=>{
 const Svg=require('react-native-svg').default;
 render(<Ring value={1620} goal={2000} size={148}/>);
 expect(screen.UNSAFE_getByType(Svg).props.viewBox).toBe('0 0 148 148');
 expect(screen.getByText('1.620')).toBeTruthy();
});
test('the moving dock lens never becomes an additional hit target or tab',()=>{
 mockState.profile.reduceMotion=true;
 render(<Dock active="recipes"/>);
 fireEvent(screen.getByTestId('dock-material-track'),'layout',{nativeEvent:{layout:{width:366,height:78,x:0,y:0}}});
 const lens=screen.getByTestId('dock-active-lens',{includeHiddenElements:true});
 expect(lens.props.pointerEvents).toBe('none');
 expect(require('react-native').StyleSheet.flatten(lens.props.style).width).toBeCloseTo(71.2);
 expect(screen.getAllByRole('tab')).toHaveLength(4);
 expect(screen.getAllByRole('button',{name:'Registrar'})).toHaveLength(1);
});
