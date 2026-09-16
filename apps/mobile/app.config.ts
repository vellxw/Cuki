import type { ExpoConfig } from 'expo/config';
const testMode=process.env.EXPO_PUBLIC_TEST_MODE==='1';
const visualMode=process.env.EXPO_PUBLIC_VISUAL_FIXTURES==='1';
if(visualMode&&(!testMode||process.env.EXPO_PUBLIC_API_URL||process.env.EXPO_PUBLIC_SUPABASE_URL))throw new Error('Visual fixtures require an isolated test build with no cloud endpoints.');
const appId=visualMode?'com.cuki.app.visual':testMode?'com.cuki.app.test':'com.cuki.app';
const config:ExpoConfig={name:visualMode?'CUKI Visual':testMode?'CUKI Test':'CUKI',slug:'cuki',version:'0.1.0',scheme:visualMode?'cuki-visual':'cuki',orientation:'portrait',userInterfaceStyle:'automatic',
 ios:{bundleIdentifier:appId,supportsTablet:false,infoPlist:{NSCameraUsageDescription:'Fotografiá tu comida o leé códigos para registrar alimentos.',NSPhotoLibraryUsageDescription:'Elegí una foto para analizar una comida o ilustrar tu receta.',NSMicrophoneUsageDescription:'Dictá lo que comiste para revisarlo antes de registrar.'}},
 android:{package:appId,permissions:['CAMERA','RECORD_AUDIO','POST_NOTIFICATIONS']},
 plugins:['./plugins/withCukiHealth.cjs','expo-router','expo-sqlite','expo-secure-store','expo-camera','expo-image-picker','expo-notifications','expo-audio','expo-localization', ['expo-build-properties',{android:{minSdkVersion:26,usesCleartextTraffic:testMode},ios:{deploymentTarget:'16.4'}}]],
 extra:{testMode,visualMode,apiUrl:process.env.EXPO_PUBLIC_API_URL??'',authUrl:process.env.EXPO_PUBLIC_SUPABASE_URL??'',authKey:visualMode?'':process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY??'',revenueCatIos:visualMode?'':process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY??'',revenueCatAndroid:visualMode?'':process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY??''}};
export default config;
