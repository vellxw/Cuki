import type { ExpoConfig } from 'expo/config';
const testMode=process.env.EXPO_PUBLIC_TEST_MODE==='1';
const config:ExpoConfig={name:testMode?'CUKI Test':'CUKI',slug:'cuki',version:'0.1.0',scheme:'cuki',orientation:'portrait',userInterfaceStyle:'automatic',
 ios:{bundleIdentifier:testMode?'com.cuki.app.test':'com.cuki.app',supportsTablet:false,infoPlist:{NSCameraUsageDescription:'Fotografiá tu comida o leé códigos para registrar alimentos.',NSPhotoLibraryUsageDescription:'Elegí una foto para analizar una comida o ilustrar tu receta.',NSMicrophoneUsageDescription:'Dictá lo que comiste para revisarlo antes de registrar.'}},
 android:{package:testMode?'com.cuki.app.test':'com.cuki.app',permissions:['CAMERA','RECORD_AUDIO','POST_NOTIFICATIONS']},
 plugins:['./plugins/withCukiHealth.cjs','expo-router','expo-sqlite','expo-secure-store','expo-camera','expo-image-picker','expo-notifications','expo-audio','expo-localization', ['expo-build-properties',{android:{usesCleartextTraffic:testMode},ios:{deploymentTarget:'16.4'}}]],
 extra:{testMode,apiUrl:process.env.EXPO_PUBLIC_API_URL??'',authUrl:process.env.EXPO_PUBLIC_SUPABASE_URL??'',authKey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY??'',revenueCatIos:process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY??'',revenueCatAndroid:process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY??''}};
export default config;
