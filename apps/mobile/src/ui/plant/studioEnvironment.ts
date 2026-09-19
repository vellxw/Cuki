import {Asset} from 'expo-asset';
import {File} from 'expo-file-system';
import * as THREE from 'three';
import metadata from '../../../assets/studio-room-1.2.json';
import {decodeStudio} from '../../../../../packages/garden-engine/studio-data';

// Baked once from the same geometric studio used by renderer 1.2.0. Do not run
// PMREMGenerator's dozens of off-screen passes while a native screen is opening.
let data:Promise<Uint16Array>|undefined;
async function pixels(){
  if(!data)data=(async()=>{
    const asset=Asset.fromModule(require('../../../assets/studio-room-1.2.bin'));
    await asset.downloadAsync();
    if(!asset.localUri)throw Error('Bundled studio lighting could not be loaded');
    return decodeStudio(await new File(asset.localUri).bytes(),metadata);
  })().catch(error=>{data=undefined;throw error});
  return data;
}
export async function studioEnvironment():Promise<THREE.DataTexture>{
  const texture=new THREE.DataTexture(await pixels(),metadata.width,metadata.height,
    THREE.RGBAFormat,THREE.HalfFloatType);
  texture.mapping=THREE.CubeUVReflectionMapping;
  texture.colorSpace=THREE.LinearSRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.flipY=false;texture.needsUpdate=true;
  return texture;
}
