import {requireOptionalNativeModule} from 'expo-modules-core';import {Platform} from 'react-native';import {invariant} from '../../../../packages/core/utils';
export interface HealthRecord {externalId:string;source:string;kind:'weight'|'workout';date:string;value:number;unit:'kg'|'seconds';startAt?:string;endAt?:string}
interface HealthBridge {isAvailable():Promise<boolean>;requestPermissions():Promise<{granted:boolean}>;readRecords(from:string,to:string):Promise<HealthRecord[]>;writeWorkout(record:{id:string;startAt:string;endAt:string;name:string}):Promise<void>;openSettings():Promise<void>}
const module=requireOptionalNativeModule<HealthBridge>('CukiHealth');
export const healthName=Platform.OS==='ios'?'Apple Health':'Health Connect';
export async function healthAvailable(){return module?module.isAvailable():false}
export async function requestHealth(){invariant(module,'Este binario no incluye el módulo de salud.');return module.requestPermissions()}
export async function readHealth(from:string,to:string){invariant(module,'Este binario no incluye el módulo de salud.');return module.readRecords(from,to)}
export async function writeHealthWorkout(record:{id:string;startAt:string;endAt:string;name:string}){invariant(module,'Este binario no incluye el módulo de salud.');return module.writeWorkout(record)}
export async function healthSettings(){invariant(module,'Módulo no disponible.');return module.openSettings()}
