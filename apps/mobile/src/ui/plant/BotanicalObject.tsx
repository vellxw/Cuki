import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber/native';
import * as THREE from 'three';
import {studioEnvironment} from './studioEnvironment';
import {botanicalLeaf,botanicalPose} from '../../../../../packages/garden-engine/botanical-mesh';
import {leafRaster} from '../../../../../packages/garden-engine/leaf-raster';
import {xorshift32,type LeafDescriptor,type PlantDescriptor} from '../../../../../packages/garden-engine';

function makeTexture(seed:number){
  const t=new THREE.DataTexture(leafRaster(seed,128,256,'1.2.0'),128,256,THREE.RGBAFormat);
  t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearFilter;t.needsUpdate=true;
  return t;
}
function potGeometry(){
  const points=[[0,-.59],[.26,-.59],[.33,-.55],[.374,-.42],[.381,-.24],[.360,-.045],
    [.33,.073],[.314,.077],[.307,.061],[.341,-.052],[.361,-.244],[.354,-.411],[.311,-.525],[.25,-.565],[0,-.565]];
  return new THREE.LatheGeometry(points.map(([x,y])=>new THREE.Vector2(x,y)),64);
}
function mediumTexture(seed:number){
  const rand=xorshift32(seed^0xa33e139a),size=128,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const grain=rand(),clump=(Math.sin(x*.16+Math.sin(y*.24))*Math.cos(y*.17)+1)*.5;
    const fiber=grain>.963?45:0,index=(y*size+x)*4;
    data[index]=32+clump*34+grain*12+fiber;data[index+1]=23+clump*23+grain*8+fiber*.69;
    data[index+2]=13+clump*12+grain*5+fiber*.36;data[index+3]=255;
  }
  const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);t.magFilter=THREE.LinearFilter;t.needsUpdate=true;
  return t;
}

/** The studio is lighting only; never replaces the native photographic backdrop.
 * Reflection approximation does not claim to refract the RN views behind the GL surface.
 */
function BotanicalLighting({onReady}:{onReady:()=>void}){
  const {scene,invalidate}=useThree();
  const [error,setError]=useState<Error|null>(null);
  useEffect(()=>{
    let alive=true,owned:THREE.DataTexture|undefined;
    const previous=scene.environment;
    void studioEnvironment().then(texture=>{
      if(!alive){texture.dispose();return;}
      owned=texture;scene.environment=texture;onReady();invalidate();
    }).catch(value=>{if(alive)setError(value instanceof Error?value:new Error(String(value)))});
    return()=>{alive=false;if(owned){if(scene.environment===owned)scene.environment=previous;owned.dispose()}};
  },[scene,invalidate,onReady]);
  if(error)throw error;
  return <><hemisphereLight args={['#D3E4D7','#151B0E',.75]}/>
    <directionalLight color="#FFF1D4" intensity={2.1} position={[1.8,3.5,3]}/>
    <directionalLight color="#BFD8D2" intensity={.85} position={[-2.5,1.2,1.8]}/></>;
}
function Branch({points,radius,color}:{points:THREE.Vector3[];radius:number;color:string}){
  const mesh=useMemo(()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),14,radius,5,false),[points,radius]);
  useEffect(()=>()=>mesh.dispose(),[mesh]);
  return <mesh geometry={mesh}><meshStandardMaterial color={color} roughness={.73}/></mesh>;
}
function Blade({leaf,week,texture}:{leaf:LeafDescriptor;week:number;texture:THREE.Texture}){
  const pose=botanicalPose(leaf,week),g=pose.growth;
  const geometry=useMemo(()=>{
    const data=botanicalLeaf(leaf,week),mesh=new THREE.BufferGeometry();
    mesh.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
    mesh.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));mesh.setIndex(new THREE.BufferAttribute(data.indices,1));
    mesh.computeVertexNormals();return mesh;
  },[leaf,week]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  const [x,y,z]=pose.position;
  const stem=useMemo(()=>[new THREE.Vector3(0,.02,0),new THREE.Vector3(x*.18,y*.6,z*.18),new THREE.Vector3(x,y,z)],[x,y,z]);
  if(g<=0)return null;
  return <group><Branch points={stem} radius={.0063*(.5+.5*g)} color="#779140"/>
    <group position={pose.position} rotation={pose.rotation}>
      <mesh geometry={geometry}><meshPhysicalMaterial map={texture} color="#FFFFFF" roughness={.44} clearcoat={.28}
        clearcoatRoughness={.35} side={THREE.DoubleSide} envMapIntensity={.45}/></mesh>
    </group></group>;
}
export function BotanicalObject({descriptor,week,animated,onFirstDraw}:{descriptor:PlantDescriptor;week:number;animated:boolean;onFirstDraw:()=>void}){
  const group=useRef<THREE.Group>(null),drew=useRef(false),{invalidate}=useThree();
  const [lightingReady,setLightingReady]=useState(false);
  const ready=useCallback(()=>setLightingReady(true),[]);
  const first=useCallback(()=>{if(lightingReady&&!drew.current){drew.current=true;onFirstDraw()}},[lightingReady,onFirstDraw]);
  const textures=useMemo(()=>Array.from({length:4},(_,i)=>makeTexture((descriptor.seed+i*83171)>>>0)),[descriptor.seed]);
  const soilTexture=useMemo(()=>mediumTexture(descriptor.seed),[descriptor.seed]);
  const pot=useMemo(potGeometry,[]);
  const soil=useMemo(()=>new THREE.LatheGeometry([[0,-.53],[.268,-.53],[.335,-.39],[.346,-.23],[.32,-.022],[0,-.022]].map(([x,y])=>new THREE.Vector2(x,y)),40),[]);
  const roots=useMemo(()=>descriptor.roots.map(r=>Array.from({length:9},(_,i)=>{
    const t=i/8,angle=r.angle+Math.sin(t*8+r.phase)*.07;
    const radius=.318+Math.sin(t*Math.PI)*.033;
    return new THREE.Vector3(Math.sin(angle)*radius,-.025-t*.50*Math.min(1,week/18),Math.cos(angle)*radius);
  })),[descriptor,week]);
  const pebbles=useMemo(()=>{const rand=xorshift32(descriptor.seed^0x91f45e);return Array.from({length:35},()=>{
    const radius=Math.sqrt(rand())*.301,angle=rand()*Math.PI*2;
    return {position:[Math.sin(angle)*radius,-.013+rand()*.012,Math.cos(angle)*radius] as [number,number,number],scale:.009+rand()*.017,color:rand()};
  })},[descriptor.seed]);
  useEffect(()=>()=>{textures.forEach(t=>t.dispose());soilTexture.dispose();pot.dispose();soil.dispose()},[textures,soilTexture,pot,soil]);
  // Render the slowly moving object at a bounded cadence instead of a hidden 60Hz loop.
  // UI animations and timers remain independent and native.
  useEffect(()=>{invalidate();if(!animated)return;const timer=setInterval(invalidate,1000/18);return()=>clearInterval(timer)},[animated,week,invalidate]);
  useFrame(({clock})=>{if(group.current)group.current.rotation.y=animated?-.28+Math.sin(clock.elapsedTime*.32)*.010:-.28});
  return <><BotanicalLighting onReady={ready}/><group ref={group} rotation={[0,-.28,0]}>
    <mesh geometry={soil} onAfterRender={first}><meshStandardMaterial map={soilTexture} roughness={.95} envMapIntensity={.45}/></mesh>
    {week>0&&roots.slice(0,Math.min(36,4+Math.floor(week*.62))).map((points,i)=><Branch key={i} points={points} radius={descriptor.roots[i].width*.8} color={i%4?'#846A42':'#B69A70'}/>)}
    {pebbles.map((item,i)=><mesh key={'soil-'+i} position={item.position} scale={[item.scale,item.scale*.48,item.scale*.72]}>
      <dodecahedronGeometry args={[1,0]}/><meshStandardMaterial color={item.color>.82?'#907052':item.color>.40?'#513B27':'#2F261A'} roughness={1}/></mesh>)}
    <mesh geometry={pot} renderOrder={3}><meshPhysicalMaterial color="#D7E4DD" metalness={.14} roughness={.08} envMapIntensity={1.45}
      transparent opacity={.22} clearcoat={1} clearcoatRoughness={.04} depthWrite={false} side={THREE.FrontSide}/></mesh>
    <mesh position={[0,.069,0]} rotation={[Math.PI/2,0,0]} renderOrder={4}>
      <torusGeometry args={[.319,.0075,8,64]}/><meshPhysicalMaterial color="#E2EADD" metalness={.55} roughness={.11} envMapIntensity={1.5}/></mesh>
    <mesh position={[0,-.58,0]} rotation={[Math.PI/2,0,0]} renderOrder={4}>
      <torusGeometry args={[.255,.007,8,48]}/><meshPhysicalMaterial color="#C8BAA4" metalness={.35} roughness={.2} envMapIntensity={.9}/></mesh>
    {week===0?<mesh position={[0,.015,0]} rotation={[.2,.3,.9]} scale={[.03,.055,.027]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#856344" roughness={.6}/></mesh>:
      descriptor.leaves.map((leaf,i)=><Blade key={leaf.id} leaf={leaf} week={week} texture={textures[i%textures.length]}/>)}
  </group></>;
}
