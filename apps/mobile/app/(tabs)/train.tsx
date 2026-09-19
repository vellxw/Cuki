import React from 'react';
import {useLocalSearchParams} from 'expo-router';
import {TrainingHome} from '../../src/screens/Training';
import {routeParameters} from '../../../../packages/core/navigation';

// Expo file routes do not receive a `params` prop. Read the actual route so a
// Home/Plans link opens the intended plan/day instead of silently using plans[0].
export default function TrainTab(){
  return <TrainingHome params={routeParameters(useLocalSearchParams())}/>;
}
