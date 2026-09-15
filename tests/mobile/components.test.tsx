import {jest,beforeEach,test,expect} from '@jest/globals';
import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react-native';
import {Button, MacroRow, Ring, Field, Dock, Screen, Txt} from '../../apps/mobile/src/ui/components';
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
