import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { SessionManager } from '../../../../packages/core/session-manager';
export type { Identity } from '../../../../packages/core/session-manager';
const config = Constants.expoConfig?.extra ?? {};
const storeKey = 'cuki.auth.v1';
const manager = new SessionManager({
  read: () => SecureStore.getItemAsync(storeKey),
  write: value => SecureStore.setItemAsync(storeKey, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  remove: () => SecureStore.deleteItemAsync(storeKey),
}, { endpoint: String(config.authUrl ?? ''), publicKey: String(config.authKey ?? '') });
export const authConfigured = manager.configured;
export const authEpoch = manager.epoch;
export const identityOf = manager.identity;
export const restoreSession = manager.restore;
export const signIn = manager.signIn;
export const signUp = manager.signUp;
export const sendOtp = manager.sendOtp;
export const verifyOtp = manager.verifyOtp;
export const resetPassword = manager.resetPassword;
export const accessToken = manager.accessToken;
export const logout = manager.logout;
