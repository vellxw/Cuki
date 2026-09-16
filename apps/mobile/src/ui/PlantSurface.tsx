import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** Fail-soft surface for a native renderer. A React exception is not the only way GL
 * can fail: native context creation can stall without throwing into an error boundary.
 * Keep the same procedural descriptor visible while starting, then abandon that GL
 * instance on a bounded foreground timeout. A draw callback is not pixel-fidelity proof.
 */
export function PlantSurface({ active, fallback, children }: {
  active: boolean;
  fallback: React.ReactNode;
  children: (onFirstDraw: () => void) => React.ReactNode;
}) {
  const [phase, setPhase] = useState<'starting' | 'drawing' | 'simplified'>('starting');
  const firstDraw = useCallback(() => setPhase(current => current === 'starting' ? 'drawing' : current), []);
  const failed = useCallback(() => setPhase('simplified'), []);
  useEffect(() => {
    if (!active || phase !== 'starting') return;
    const timer = setTimeout(failed, 7000);
    return () => clearTimeout(timer);
  }, [active, phase, failed]);
  return <View style={{ flex: 1 }} testID="plant-render-surface" accessible={false}>
    {phase !== 'simplified' && <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
      <RendererBoundary onFailure={failed}>{children(firstDraw)}</RendererBoundary>
    </View>}
    {phase !== 'drawing' && <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="plant-procedural-alternative">
      {fallback}
      <Text style={{ color: '#B8C2BE', fontSize: 10, textAlign: 'center' }}>
        {phase === 'starting' ? 'Preparando vista 3D' : 'Vista procedural simplificada'}
      </Text>
    </View>}
    <View testID={'plant-render-' + phase} style={{ width: 1, height: 1 }} accessible={false}/>
  </View>;
}

class RendererBoundary extends React.Component<{ children: React.ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
