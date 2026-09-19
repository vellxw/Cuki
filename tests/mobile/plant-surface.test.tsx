import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PlantSurface } from '../../apps/mobile/src/ui/PlantSurface';

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
const seedView = <Text>Same seed and growth stage</Text>;
test('a stalled native context has a visible procedural alternative, never a permanently empty hero', () => {
  render(<PlantSurface active fallback={seedView}>{() => <Text>GPU instance</Text>}</PlantSurface>);
  expect(screen.getByText('Same seed and growth stage')).toBeTruthy();
  act(() => jest.advanceTimersByTime(7000));
  expect(screen.getByText('Vista procedural simplificada')).toBeTruthy();
  expect(screen.queryByText('GPU instance')).toBeNull();
});
test('a draw from the actual scene removes the alternative and cancels startup timeout', () => {
  let draw!: () => void;
  render(<PlantSurface active fallback={seedView}>{ready => { draw=ready; return <Text>GPU instance</Text>; }}</PlantSurface>);
  act(() => draw()); act(() => jest.advanceTimersByTime(30000));
  expect(screen.queryByTestId('plant-procedural-alternative')).toBeNull();
  expect(screen.getByText('GPU instance')).toBeTruthy();
  expect(screen.getByTestId('plant-render-drawing')).toBeTruthy();
});
test('background time is not misclassified as a graphics startup failure', () => {
  const renderer = () => <Text>GPU instance</Text>;
  const view=render(<PlantSurface active={false} fallback={seedView}>{renderer}</PlantSurface>);
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.getByTestId('plant-render-paused')).toBeTruthy();
  expect(screen.queryByText('GPU instance')).toBeNull();
  view.rerender(<PlantSurface active fallback={seedView}>{renderer}</PlantSurface>);
  act(() => jest.advanceTimersByTime(6000));
  expect(screen.getByTestId('plant-render-starting')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByTestId('plant-render-simplified')).toBeTruthy();
});
test('late callback from an abandoned context does not replace the safe alternative', () => {
  let draw!: () => void;
  render(<PlantSurface active fallback={seedView}>{ready => { draw=ready; return <Text>GPU instance</Text>; }}</PlantSurface>);
  act(() => jest.advanceTimersByTime(7000)); act(() => draw());
  expect(screen.getByTestId('plant-render-simplified')).toBeTruthy();
  expect(screen.queryByText('GPU instance')).toBeNull();
});
test('unmount cancels the pending native startup watchdog', () => {
  const view=render(<PlantSurface active fallback={seedView}>{() => null}</PlantSurface>);
  expect(jest.getTimerCount()).toBeGreaterThan(0);
  view.unmount(); expect(jest.getTimerCount()).toBe(0);
});
test('renderer errors preserve the same alternative without navigation or data mutation', () => {
  const consoleError=jest.spyOn(console,'error').mockImplementation(()=>{});
  function Failure(): React.ReactNode { throw new Error('graphics unavailable'); }
  render(<PlantSurface active fallback={seedView}>{() => <Failure/>}</PlantSurface>);
  expect(screen.getByText('Same seed and growth stage')).toBeTruthy();
  expect(screen.getByTestId('plant-render-simplified')).toBeTruthy();
  expect(consoleError).toHaveBeenCalled();
});

test('an inactive native screen never creates a renderer, even during preload', () => {
  const renderGPU=jest.fn<(_:()=>void)=>React.ReactNode>(()=><Text>GPU instance</Text>);
  render(<PlantSurface active={false} fallback={seedView}>{renderGPU}</PlantSurface>);
  expect(renderGPU).not.toHaveBeenCalled();
  expect(screen.getByTestId('plant-render-paused')).toBeTruthy();
  expect(jest.getTimerCount()).toBe(0);
});
test('focus loss disposes the mounted scene and returning requires a fresh draw', () => {
  let mounted=0,disposed=0;
  let lastDraw!:()=>void;
  function GPU(){React.useEffect(()=>{mounted++;return()=>{disposed++}},[]);return <Text>GPU instance</Text>}
  const renderer=(draw:()=>void)=>{lastDraw=draw;return <GPU/>};
  const view=render(<PlantSurface active fallback={seedView}>{renderer}</PlantSurface>);
  const oldDraw=lastDraw;
  act(()=>oldDraw());expect(mounted).toBe(1);
  view.rerender(<PlantSurface active={false} fallback={seedView}>{renderer}</PlantSurface>);
  expect(disposed).toBe(1);expect(screen.queryByText('GPU instance')).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
  view.rerender(<PlantSurface active fallback={seedView}>{renderer}</PlantSurface>);
  expect(mounted).toBe(2);expect(screen.getByTestId('plant-render-starting')).toBeTruthy();
  act(()=>oldDraw());expect(screen.getByTestId('plant-render-starting')).toBeTruthy();
  act(()=>lastDraw());expect(screen.getByTestId('plant-render-drawing')).toBeTruthy();
  view.unmount();expect(disposed).toBe(2);
});
test('an abandoned native context is not retried repeatedly when focus changes', () => {
  const renderer=jest.fn<(_:()=>void)=>React.ReactNode>(()=><Text>GPU instance</Text>);
  const view=render(<PlantSurface active fallback={seedView}>{renderer}</PlantSurface>);
  act(()=>jest.advanceTimersByTime(7000));const calls=renderer.mock.calls.length;
  view.rerender(<PlantSurface active={false} fallback={seedView}>{renderer}</PlantSurface>);
  view.rerender(<PlantSurface active fallback={seedView}>{renderer}</PlantSurface>);
  expect(renderer.mock.calls).toHaveLength(calls);
  expect(screen.getByTestId('plant-render-simplified')).toBeTruthy();
  expect(screen.getByText('Same seed and growth stage')).toBeTruthy();
});
