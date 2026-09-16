import {identityOf} from '../data/auth';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {Platform} from 'react-native';
import * as Crypto from 'expo-crypto';
import {invariant} from '../../../../packages/core/utils';
import type {HealthRecord,HealthPermissions,HealthAuthorization,HealthReadResult,HealthWorkout} from '../../../../packages/core/health-client';
export type {HealthRecord,HealthPermissions,HealthAuthorization,HealthReadResult};
interface HealthBridge {
 isAvailable():Promise<boolean>;
 requestPermissions(options:HealthPermissions):Promise<HealthAuthorization>;
 readRecords(from:string,to:string,options:HealthPermissions):Promise<HealthReadResult>;
 writeWorkout(record:HealthWorkout):Promise<{confirmed:boolean;externalId:string}>;
 openSettings():Promise<void>;
}
const module=requireOptionalNativeModule<HealthBridge>('CukiHealth');
export const healthName=Platform.OS==='ios'?'Apple Health':'Health Connect';
export async function healthAvailable(){return module?module.isAvailable():false}
export async function requestHealth(options:HealthPermissions){invariant(module,'Este binario no incluye el módulo de salud.');return module.requestPermissions(options)}
export async function readHealth(from:string,to:string,options:HealthPermissions){invariant(module,'Este binario no incluye el módulo de salud.');return module.readRecords(from,to,options)}
export async function writeHealthWorkout(record:HealthWorkout){invariant(module,'Este binario no incluye el módulo de salud.');return module.writeWorkout(record)}
export async function healthSettings(){invariant(module,'Módulo no disponible.');return module.openSettings()}
export const healthDigest=(value:string)=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value);
export const healthWriter={requestPermissions:requestHealth,writeWorkout:writeHealthWorkout};

export const healthAccountGuard=(actor:string)=>()=>(identityOf()?.userId??'guest')===actor;
