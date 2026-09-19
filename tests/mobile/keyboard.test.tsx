import { jest, test, expect, afterEach } from '@jest/globals';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, Platform } from 'react-native';
import { KeyboardDismissBar } from '../../apps/mobile/src/ui/KeyboardDismissBar';
jest.mock('../../apps/mobile/src/ui/theme', () => ({ useTheme: () => ({ c: {surface:'#101713',line:'#303933',text:'#ffffff'} }) }));
afterEach(() => { jest.restoreAllMocks(); });

test('keyboard action is absent when no input is active', () => {
 jest.spyOn(Keyboard,'isVisible').mockReturnValue(false);
 render(<KeyboardDismissBar/>); expect(screen.queryByTestId('keyboard-dismiss')).toBeNull();
});
test('iOS numeric input can dismiss keyboard explicitly without saving, navigating or losing data', () => {
 expect(Platform.OS).toBe('ios');
 jest.spyOn(Keyboard,'isVisible').mockReturnValue(false);
 const handlers:Record<string,()=>void> = {};
 const removed = jest.fn();
 const add = Keyboard.addListener.bind(Keyboard);
 jest.spyOn(Keyboard,'addListener').mockImplementation((event, handler) => {
  handlers[event]=handler as ()=>void;
  const subscription=add(event,handler), remove=subscription.remove.bind(subscription);
  subscription.remove=()=>{removed();remove();};return subscription;
 });
 const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
 const view=render(<KeyboardDismissBar/>);
 act(()=>handlers.keyboardWillShow());
 fireEvent.press(screen.getByRole('button',{name:'Ocultar teclado'}));
 expect(dismiss).toHaveBeenCalledTimes(1);
 act(()=>handlers.keyboardWillHide());expect(screen.queryByTestId('keyboard-dismiss')).toBeNull();
 view.unmount();expect(removed).toHaveBeenCalledTimes(2);
});

test('Android exposes an explicit finish action when its numeric keyboard covers a long form',()=>{
 jest.replaceProperty(Platform,'OS','android');
 jest.spyOn(Keyboard,'isVisible').mockReturnValue(false);
 const handlers:Record<string,()=>void>={};const removed=jest.fn();const add=Keyboard.addListener.bind(Keyboard);
 jest.spyOn(Keyboard,'addListener').mockImplementation((event,handler)=>{
  handlers[event]=handler as ()=>void;const subscription=add(event,handler);const remove=subscription.remove.bind(subscription);subscription.remove=()=>{removed();remove()};return subscription;
 });
 const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
 const view=render(<KeyboardDismissBar/>);
 expect(Object.keys(handlers).sort()).toEqual(['keyboardDidHide','keyboardDidShow']);
 act(()=>handlers.keyboardDidShow());
 fireEvent.press(screen.getByRole('button',{name:'Ocultar teclado'}));expect(dismiss).toHaveBeenCalledTimes(1);
 act(()=>handlers.keyboardDidHide());expect(screen.queryByTestId('keyboard-dismiss')).toBeNull();
 view.unmount();expect(removed).toHaveBeenCalledTimes(2);
});
