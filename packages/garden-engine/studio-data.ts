/** Decode the bundled prefiltered light field, never a photograph of a plant.
 * Pixel data is immutable CPU state and may be shared; each native GL context
 * must create/dispose its own GPU texture. Bounds precede allocation.
 */
export interface StudioMetadata {width:number;height:number;byteLength:number;encoding:string;sha256:string}
export function decodeStudio(bytes:Uint8Array, metadata:StudioMetadata):Uint16Array {
  const {width,height}=metadata;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16
      ||width>2048||height>2048||width*height>1048576)
    throw Error('Invalid studio texture dimensions');
  if(metadata.encoding!=='RGBA half-float little-endian, CubeUVReflectionMapping'
      ||metadata.byteLength!==width*height*8||bytes.byteLength!==metadata.byteLength)
    throw Error('Invalid studio texture encoding or length');
  const source=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const half=new Uint16Array(bytes.byteLength/2);
  for(let i=0;i<half.length;i++) {
    const value=source.getUint16(i*2,true);
    if((value&0x7c00)===0x7c00)throw Error('Non-finite studio radiance');
    half[i]=value;
  }
  return half;
}
