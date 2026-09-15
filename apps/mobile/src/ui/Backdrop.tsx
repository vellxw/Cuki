import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { View } from 'react-native';
export type BackdropTarget = React.RefObject<View | null>;
export const SurfaceBackdrop = createContext<BackdropTarget | null>(null);
interface DockContext {
 target: BackdropTarget | null;
 register(target: BackdropTarget): () => void;
}
const DockBackdrop = createContext<DockContext>({ target: null, register: () => () => {} });
/** A focused screen exposes only its content to the sibling dock. Inline glass samples a
 * separate background layer, so the blur target never recursively samples itself. */
export function BackdropProvider({ children }: { children: React.ReactNode }) {
 const [target, setTarget] = useState<BackdropTarget | null>(null);
 const register = useCallback((value: BackdropTarget) => {
  setTarget(value);
  return () => setTarget(current => current === value ? null : current);
 }, []);
 const value = useMemo(() => ({ target, register }), [target, register]);
 return <DockBackdrop.Provider value={value}>{children}</DockBackdrop.Provider>;
}
export const useDockBackdrop = () => useContext(DockBackdrop);
