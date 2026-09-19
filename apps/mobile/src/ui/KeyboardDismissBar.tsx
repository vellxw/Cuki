import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from './theme';

/** A visible, accessible native action on both platforms
 * lets users finish editing without scrolling behind or swiping over the keyboard.
 * It lives inside the same KeyboardAvoidingView as the form, not an absolute overlay.
 */
export function KeyboardDismissBar() {
  const { c } = useTheme();
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (!visible) return null;
  return <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.line, alignItems: 'flex-end', paddingHorizontal: 16 }}>
    <Pressable testID="keyboard-dismiss" accessibilityRole="button" accessibilityLabel="Ocultar teclado"
      onPress={() => Keyboard.dismiss()} style={{ minHeight: Platform.OS === 'android' ? 48 : 44, minWidth: 70, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>Listo</Text>
    </Pressable>
  </View>;
}
