import {jest} from '@jest/globals';
// Operating-system surfaces are replaced only for component tests. Native CI tests
// the actual modules; passing this suite is not evidence of a compiled binary.
jest.mock('expo-router', () => ({
  router: { navigate: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useRouter: () => require('expo-router').router,
  useFocusEffect: () => {},
  usePathname: () => '/recipes',
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-glass-effect', () => ({
  GlassView: require('react-native').View,
  isLiquidGlassAvailable: () => false,
  isGlassEffectAPIAvailable: () => false,
}));
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View, BlurTargetView: require('react-native').View }));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));
jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: { extension:'.m4a' } },
  useAudioRecorder: jest.fn(() => ({ uri:null, record:jest.fn(), stop:jest.fn(), getStatus:()=>({isRecording:false,canRecord:false}), prepareToRecordAsync:jest.fn() })),
  useAudioRecorderState: jest.fn(() => ({durationMillis:0,isRecording:false})),
  requestRecordingPermissionsAsync: jest.fn(async()=>({granted:false})),
  setAudioModeAsync: jest.fn(async()=>{}),
}));
