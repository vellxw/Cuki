import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Renderer = (onFirstDraw: () => void) => React.ReactNode;

/** Native stacks keep inactive screens mounted. A stopped frame loop still owns a
 * GL context, textures and render targets. Mount the renderer only while visible
 * and foregrounded; the persistent seed and growth history remain outside it.
 * Each activation owns its first-draw callback and watchdog, so a late callback
 * from a disposed context cannot approve a different instance.
 */
export function PlantSurface({ active, fallback, children }: {
  active: boolean;
  fallback: React.ReactNode;
  children: Renderer;
}) {
  const [failed, setFailed] = useState(false);
  const abandon = useCallback(() => setFailed(true), []);
  return <View style={{ flex: 1 }} testID="plant-render-surface" accessible={false}>
    {failed ? <Alternative phase="simplified">{fallback}</Alternative>
      : active ? <VisibleSurface fallback={fallback} renderer={children} onFailure={abandon}/>
      : <Alternative phase="paused">{fallback}</Alternative>}
  </View>;
}

function Alternative({phase, children}: {
  phase: 'starting' | 'simplified' | 'paused'; children: React.ReactNode;
}) {
  return <>
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="plant-procedural-alternative">
      {children}
      <Text style={{ color: '#B8C2BE', fontSize: 10, textAlign: 'center' }}>
        {phase === 'starting' ? 'Preparando vista 3D'
          : phase === 'paused' ? 'Vista 3D en pausa' : 'Vista procedural simplificada'}
      </Text>
    </View>
    <View testID={'plant-render-' + phase} style={{ width: 1, height: 1 }} accessible={false}/>
  </>;
}

function VisibleSurface({ fallback, renderer, onFailure }: {
  fallback: React.ReactNode; renderer: Renderer; onFailure: () => void;
}) {
  const [drawing, setDrawing] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const firstDraw = useCallback(() => {
    if (alive.current) setDrawing(true);
  }, []);
  useEffect(() => {
    if (drawing) return;
    const timer = setTimeout(() => { if (alive.current) onFailure(); }, 7000);
    return () => clearTimeout(timer);
  }, [drawing, onFailure]);
  return <>
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
      <RendererBoundary onFailure={onFailure}>{renderer(firstDraw)}</RendererBoundary>
    </View>
    {drawing ? <View testID="plant-render-drawing" style={{width:1,height:1}} accessible={false}/>
      : <Alternative phase="starting">{fallback}</Alternative>}
  </>;
}

class RendererBoundary extends React.Component<{ children: React.ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
