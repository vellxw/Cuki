import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';

/** Numeric iOS keyboards have no Return key. A visible, accessible native action
 * lets users finish editing without scrolling behind or swiping over the keyboard.
 * It lives inside the same KeyboardAvoidingView as the form, not an absolute overlay.
 */
export function KeyboardDismissBar() {
  const { c } = useTheme();
  const [visible, setVisible] = useState(() => Platform.OS === 'ios' && Keyboard.isVisible());
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (!visible) return null;
  return <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, alignItems: 'flex-end', paddingHorizontal: 16 }}>
    <Pressable testID="keyboard-dismiss" accessibilityRole="button" accessibilityLabel="Ocultar teclado"
      onPress={() => Keyboard.dismiss()} style={{ minHeight: 44, minWidth: 70, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>Listo</Text>
    </Pressable>
  </View>;
}
