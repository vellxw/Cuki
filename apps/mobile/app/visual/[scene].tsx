import React from 'react';
import {useLocalSearchParams} from 'expo-router';
import {VisualReferenceScene} from '../../src/testing/VisualScene';
export default function VisualScreen(){const {scene}=useLocalSearchParams();return <VisualReferenceScene scene={scene}/>;}
