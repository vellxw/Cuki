import {useApp} from '../data/AppProvider';
import {CURRENT_RENDERER,leafRaster,type PlantRendererVersion} from '../../../../packages/garden-engine/leaf-raster';
import React,{Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';import {AppState,Platform,Text,View} from 'react-native';import {Canvas,useFrame} from '@react-three/fiber/native';import * as THREE from 'three';import Svg,{Defs,LinearGradient as SVGGradient,Stop,Path,Ellipse,G} from 'react-native-svg';import {useFocusEffect} from 'expo-router';import {generatePlant,leafGrowth,type LeafDescriptor,type PlantDescriptor} from '../../../../packages/garden-engine';import {useTheme} from './theme';
import {PlantSurface} from './PlantSurface';
function leafGeometry(d:LeafDescriptor,growth:number){const positions:number[]=[],uv:number[]=[],indices:number[]=[];const rows=18,cols=8;for(let i=0;i<=rows;i++){const t=i/rows;const width=Math.pow(Math.sin(Math.PI*t),.7)*d.width*growth;for(let j=0;j<=cols;j++){const u=j/cols;const x=(u*2-1)*width;const y=t*d.length*growth;const z=d.bend*Math.sin(t*Math.PI*.95)*growth+(u-.5)**2*.18*growth;positions.push(x,y,z);uv.push(u,t);if(i<rows&&j<cols){const a=i*(cols+1)+j,b=a+cols+1;indices.push(a,b,a+1,b,b+1,a+1)}}}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return geo}
function leafTexture(seed:number,version:PlantRendererVersion){const width=128,height=256;const t=new THREE.DataTexture(leafRaster(seed,width,height,version),width,height,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t}
// Small deterministic production texture: soil is an actual shaded 3D surface,
// not a photograph of a whole plant. No external assets or random per-frame noise.
function soilTexture(seed:number){
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const noise=Math.sin(x*12.9898+y*78.233+(seed%997))*43758.5453;
  const grain=noise-Math.floor(noise);
  const clump=(Math.sin(x*.24+Math.sin(y*.16))*Math.cos(y*.23+x*.03)+1)*.5;
  const fibre=grain>.965?1:0;
  const i=(y*size+x)*4;
  data[i]=12+clump*22+grain*8+fibre*32;
  data[i+1]=9+clump*12+grain*5+fibre*20;
  data[i+2]=6+clump*5+grain*3+fibre*9;data[i+3]=255;
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.repeat.set(3,2);texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
 return texture;
}
function Tube({points,radius,color}:{points:THREE.Vector3[];radius:number;color:string}){const geometry=useMemo(()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,radius,5,false),[points,radius]);useEffect(()=>()=>geometry.dispose(),[geometry]);return <mesh geometry={geometry}><meshStandardMaterial color={color} roughness={.62}/></mesh>}
function Leaf({d,week,texture}:{d:LeafDescriptor;week:number;texture:THREE.Texture}){const growth=leafGrowth(d,week),geo=useMemo(()=>leafGeometry(d,growth),[d,growth]);useEffect(()=>()=>geo.dispose(),[geo]);const px=Math.sin(d.angle)*d.stemLength, pz=Math.cos(d.angle)*d.stemLength*.62, y=d.height;const stem=useMemo(()=>[new THREE.Vector3(0,.04,0),new THREE.Vector3(px*.28,y*.58,pz*.2),new THREE.Vector3(px,y,pz)],[px,pz,y]);if(growth<=0)return null;return <group><Tube points={stem} radius={.008} color="#6C8431"/><group position={[px,y,pz]} rotation={[.18+d.azimuth, d.angle, Math.sin(d.angle)*.35]}><mesh geometry={geo}><meshPhysicalMaterial map={texture} roughness={.36} metalness={0} clearcoat={.36} clearcoatRoughness={.25} side={THREE.DoubleSide}/></mesh></group></group>}
function Object3D({descriptor,week,animated,onFirstDraw,rendererVersion}:{descriptor:PlantDescriptor;week:number;animated:boolean;onFirstDraw:()=>void;rendererVersion:PlantRendererVersion}){const group=useRef<THREE.Group>(null);const drew=useRef(false);const firstDraw=useCallback(()=>{if(!drew.current){drew.current=true;onFirstDraw()}},[onFirstDraw]);const texture=useMemo(()=>leafTexture(descriptor.seed,rendererVersion),[descriptor.seed,rendererVersion]);const soilMap=useMemo(()=>soilTexture(descriptor.seed),[descriptor.seed]);useEffect(()=>()=>{texture.dispose();soilMap.dispose()},[texture,soilMap]);useFrame(({clock})=>{if(group.current&&animated)group.current.rotation.y=-.28+Math.sin(clock.elapsedTime*.35)*.012});const pot=useMemo(()=>new THREE.LatheGeometry([new THREE.Vector2(.27,-.59),new THREE.Vector2(.33,-.53),new THREE.Vector2(.375,-.34),new THREE.Vector2(.36,-.06),new THREE.Vector2(.33,.075),new THREE.Vector2(.315,.075),new THREE.Vector2(.345,-.06),new THREE.Vector2(.36,-.34),new THREE.Vector2(.315,-.51),new THREE.Vector2(.27,-.56)],48),[]);const soil=useMemo(()=>new THREE.LatheGeometry([new THREE.Vector2(0,-.53),new THREE.Vector2(.275,-.53),new THREE.Vector2(.345,-.32),new THREE.Vector2(.33,-.05),new THREE.Vector2(.315,.025),new THREE.Vector2(0,.025)],32),[]);useEffect(()=>()=>{pot.dispose();soil.dispose()},[pot,soil]);const roots=useMemo(()=>descriptor.roots.map(r=>Array.from({length:7},(_,i)=>{const t=i/6,ang=r.angle+Math.sin(t*6+r.phase)*.15;const radius=.327+Math.sin(t*Math.PI)*.026;return new THREE.Vector3(Math.sin(ang)*radius,.02-t*.54*Math.min(1,week/18),Math.cos(ang)*radius)})),[descriptor,week]);return <group ref={group} rotation={[0,-.28,0]}>
 <mesh geometry={soil} onAfterRender={firstDraw}><meshStandardMaterial map={soilMap} color="#B8A691" roughness={.98}/></mesh>
 {week>0&&roots.slice(0,Math.min(36,4+Math.floor(week*.62))).map((points,i)=><Tube key={i} points={points} radius={descriptor.roots[i].width} color={i%4?'#493622':'#806641'}/>)}
 <mesh geometry={pot} renderOrder={2}><meshPhysicalMaterial color="#DEE6DE" roughness={.075} metalness={0} transparent opacity={.10} clearcoat={1} clearcoatRoughness={.04} side={THREE.FrontSide} depthWrite={false}/></mesh>
 <mesh position={[0,.075,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.323,.007,8,48]}/><meshPhysicalMaterial color="#E2E8DF" metalness={.5} roughness={.16}/></mesh>
 {Array.from({length:26},(_,i)=><mesh key={'moss'+i} position={[Math.sin(i*2.4)*(.10+i%4*.04),.026+Math.sin(i)*.007,Math.cos(i*2.4)*(.10+i%4*.04)]} scale={[.023,.009,.018]}><sphereGeometry args={[1,6,4]}/><meshStandardMaterial color={i%3===0?'#556229':'#333B15'} roughness={1}/></mesh>)}
 {week===0?<mesh position={[0,.055,0]} rotation={[.2,.3,.9]} scale={[.03,.055,.027]}><sphereGeometry args={[1,12,8]}/><meshStandardMaterial color="#705031" roughness={.7}/></mesh>:descriptor.leaves.map(d=><Leaf key={d.id} d={d} week={week} texture={texture}/>)}
 </group>}
export function Plant({seed,weeks,height=300}:{seed:number;weeks:number;height?:number}) {
 const descriptor=useMemo(()=>generatePlant(seed>>>0),[seed]);const {reduceMotion}=useTheme();
 const {state}=useApp();
 const persisted=(state.garden?.plant.seed===seed?state.garden.plant:state.plants.find(p=>p.seed===seed));
 const version=persisted?.rendererVersion??CURRENT_RENDERER;
 const rendererVersion:PlantRendererVersion=version==='1.0.0'?'1.0.0':CURRENT_RENDERER;
 const supported=version==='1.0.0'||version===CURRENT_RENDERER;
 const [focused,setFocused]=useState(true);
 const [foreground,setForeground]=useState(AppState.currentState===null||AppState.currentState==='active');
 useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false)},[]));
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>sub.remove()},[]);
 const active=focused&&foreground,week=Math.min(52,Math.max(0,weeks));
 const alternative=<PlantLite seed={seed} weeks={week} height={height-18}/>;
 return <View style={{height,width:'100%'}} accessibilityLabel={`Planta procedural, ${week} semanas acreditadas`} accessible>
  {!supported?<View><PlantLite seed={seed} weeks={week} height={height-24}/><Text style={{color:'#B8C2BE',fontSize:11}}>Vista simplificada; versión de render no disponible.</Text></View>:<PlantSurface key={String(seed)+rendererVersion} active={active} fallback={alternative}>{onFirstDraw=><Suspense fallback={null}>
   <Canvas style={{width:'100%',height:'100%'}} frameloop={!active?'never':reduceMotion?'demand':'always'}
    camera={{position:[0,.55,3.45],fov:36,near:.1,far:30}}
    onCreated={({gl,camera})=>{gl.setClearColor(0x000000,0);camera.lookAt(0,.45,0)}}>
    <ambientLight intensity={rendererVersion==='1.0.0'?1.2:.8}/>
    <directionalLight position={[2,4,3]} intensity={rendererVersion==='1.0.0'?3.2:2.6} color="#FFF0D5"/>
    <directionalLight position={[-3,1,2]} intensity={rendererVersion==='1.0.0'?1.1:.7} color="#B4D7CE"/>
    <Object3D rendererVersion={rendererVersion} descriptor={descriptor} week={week} animated={active&&!reduceMotion} onFirstDraw={onFirstDraw}/>
   </Canvas>
  </Suspense>}</PlantSurface>}
 </View>;
}
export function PlantLite({seed,weeks,height=140}:{seed:number;weeks:number;height?:number}){const p=useMemo(()=>generatePlant(seed>>>0),[seed]);return <Svg width="100%" height={height} viewBox="0 0 240 300" accessible={false}><Defs><SVGGradient id="pot" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#E3E7DC" stopOpacity={.6}/><Stop offset=".2" stopColor="#9DA99E" stopOpacity={.12}/><Stop offset=".8" stopColor="#9DA99E" stopOpacity={.14}/><Stop offset="1" stopColor="#E8D6B9" stopOpacity={.6}/></SVGGradient><SVGGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#BECA68"/><Stop offset=".5" stopColor="#607329"/><Stop offset="1" stopColor="#283C17"/></SVGGradient></Defs><Path d="M77 200 Q60 252 87 270 Q120 282 153 270 Q180 252 163 200Z" fill="#1B1910"/><G>{p.leaves.filter(d=>leafGrowth(d,weeks)>0).map((d,i)=>{const g=leafGrowth(d,weeks);const x=120+Math.sin(d.angle)*42,y=196-d.height*75,l=d.length*95*g,side=Math.sin(d.angle)>=0?1:-1;return <G key={d.id}><Path d={`M120 205 Q${x} ${y+20} ${x} ${y}`} stroke="#72893D" strokeWidth={2.2} fill="none"/><Path d={`M${x} ${y} Q${x+side*l*.95} ${y+10} ${x+side*l*.65} ${y-l} Q${x-side*l*.25} ${y-l*.68} ${x} ${y}Z`} fill="url(#leaf)" stroke="#B4C681" strokeWidth={.6}/><Path d={`M${x} ${y} Q${x+side*l*.30} ${y-l*.55} ${x+side*l*.65} ${y-l}`} stroke="#CAD099" strokeWidth={.8} fill="none"/></G>})}</G>{weeks===0&&<Ellipse cx={120} cy={194} rx={5} ry={8} fill="#947349"/>}<Path d="M77 200 Q60 252 87 270 Q120 282 153 270 Q180 252 163 200Z" fill="url(#pot)" stroke="#CAD2C9" strokeWidth={1.2}/><Ellipse cx={120} cy={200} rx={43} ry={7} fill="none" stroke="#CAD2C9" strokeWidth={1.2}/></Svg>}
