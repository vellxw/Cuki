import React from 'react';
import {View} from 'react-native';
import {onboardingScreens} from './Onboarding';
import {homeScreens} from './Home';
import {foodScreens} from './Foods';
import {recipeScreens} from './Recipes';
import {planningScreens} from './Planning';
import {trainingScreens} from './Training';
import {progressScreens} from './Progress';
import {billingScreens} from './Billing';
import {settingsScreens} from './Settings';
import {gardenScreens} from './Garden';
import {Screen,Empty,Dock,useNav,type ScreenProps,type TabName} from '../ui/components';
export const screens:Record<string,React.ComponentType<ScreenProps>>={...onboardingScreens,...homeScreens,...foodScreens,...recipeScreens,...planningScreens,...trainingScreens,...progressScreens,...billingScreens,...settingsScreens,...gardenScreens};
export const SCREEN_IDS=Object.keys(screens).sort();
const mainTabs:Record<string,TabName>={'SC-07':'home','SC-23':'recipes','SC-42':'train','SC-57':'progress'};
export function ScreenRouter({screen,params}:{screen:string;params:ScreenProps['params']}){const nav=useNav();const Component=screens[screen];if(!Component)return <Screen title="Pantalla no disponible"><Empty title="Este destino no pertenece al cliente móvil" detail="Las herramientas administrativas se mantienen fuera de la app de consumo." action="Ir a Hoy" onPress={()=>nav.tab('home')}/></Screen>;return <View style={{flex:1}}><Component params={params}/>{mainTabs[screen]&&<Dock active={mainTabs[screen]}/>}</View>;}
