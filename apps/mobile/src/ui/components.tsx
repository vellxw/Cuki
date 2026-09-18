import React,{useEffect,useMemo,useRef,useState,useContext,useCallback} from 'react';
import {View,Text,Pressable,ScrollView,TextInput,Switch,StyleSheet,ActivityIndicator,Alert,KeyboardAvoidingView,Platform,Animated,Easing,type TextProps,type ViewStyle,type StyleProp,type TextInputProps,useWindowDimensions,AccessibilityInfo} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';import {useRouter,useLocalSearchParams,usePathname,useFocusEffect,type Href} from 'expo-router';import {Image} from 'expo-image';import {LinearGradient} from 'expo-linear-gradient';import {BlurView,BlurTargetView} from 'expo-blur';import {GlassView,isLiquidGlassAvailable,isGlassEffectAPIAvailable} from 'expo-glass-effect';import * as Haptics from 'expo-haptics';import Svg,{Circle,Defs,LinearGradient as SVGGradient,Stop} from 'react-native-svg';
import {useApp} from '../data/AppProvider';import {Icon} from './Icon';import {layout,useTheme,tokens} from './theme';import type {Nutrients} from '../../../../packages/core/types';import {duration,fmt,localDate,prettyDate,validDate} from '../../../../packages/core/utils';
import {SurfaceBackdrop,useDockBackdrop,type BackdropTarget} from './Backdrop';
import {KeyboardDismissBar} from './KeyboardDismissBar';
import {tabPaths, rootScreenPaths, originHref, safeReturnHref} from '../../../../packages/core/navigation';
export const art={clean:require('../../assets/botanical-clean.webp'),bowl:require('../../assets/bowl.webp')};
export type TabName='home'|'recipes'|'train'|'progress';export interface ScreenProps {params:Record<string,string|undefined>}
export function useNav() {
 const router=useRouter(),path=usePathname(),raw=useLocalSearchParams();
 const params=raw as Record<string,string|undefined>;
 return useMemo(()=>{
  const returning=safeReturnHref(params.returnTo);
  const target=(id:string,p:Record<string,string|number|undefined>={})=>{
   const {returnTo,...rest}=p;const origin=safeReturnHref(returnTo)??returning;
   return {pathname:rootScreenPaths[id]??'/screen/[screenId]',
    params:{...rest,...(rootScreenPaths[id]?{}:{screenId:id}),...(origin?{returnTo:origin}:{})}} as Href;
  };
  return {
   go:(id:string,p:Record<string,string|number|undefined>={})=>{
    const destination=target(id,id==='SC-12'?{returnTo:returning??originHref(path,raw),...p}:p);
    // A logical root must use the existing tab navigator, never a generic screen
    // with the same contents but no dock (and another history stack underneath).
    return rootScreenPaths[id]?router.dismissTo(destination):router.push(destination);
   },
   replace:(id:string,p:Record<string,string|number|undefined>={})=>rootScreenPaths[id]?router.dismissTo(target(id,p)):router.replace(target(id,p)),
   back:()=>router.canGoBack()?router.back():router.replace(tabPaths.home as Href),
   tab:(name:TabName)=>router.navigate(tabPaths[name] as Href),
   finish:(id:string,p:Record<string,string|number|undefined>={})=>router.dismissTo(target(id,p)),
   register:(p:Record<string,string|number|undefined>={})=>router.push({pathname:'/register',params:{...p,returnTo:originHref(path,raw)}} as Href),
   completeRegistration:()=>router.dismissTo((returning??tabPaths.home) as Href),
  };
 },[router,path,JSON.stringify(raw)]);
}
export function Txt({size=16,weight='400',tone='text',style,children,...props}:TextProps&{size?:number;weight?:'400'|'500'|'600'|'700';tone?:'text'|'secondary'|'muted'|'protein'|'carbs'|'fat'|'error'|'warning'}){const {c}=useTheme();return <Text {...props} style={[{fontSize:size,lineHeight:size*1.35,fontWeight:weight,color:c[tone],fontVariant:['tabular-nums']},style]}>{children}</Text>}
export const Title=({children}:{children:React.ReactNode})=><Txt size={28} weight="600">{children}</Txt>;
/** The backdrop is sampled by the platform; only the thin optical rim is drawn by CUKI.
 * No opacity on a native GlassView ancestor, and no image of a UI control is used.
 */
export function Glass({children,style,strong=false,blurTarget}:{children?:React.ReactNode;style?:StyleProp<ViewStyle>;strong?:boolean;blurTarget?:BackdropTarget|null}) {
 const {c,dark,reduceTransparency}=useTheme();
 const inheritedTarget=useContext(SurfaceBackdrop);
 const target=blurTarget??inheritedTarget;
 const radius=StyleSheet.flatten(style)?.borderRadius??(strong?999:24);
 const base:ViewStyle={borderRadius:radius,overflow:'hidden'};
 const native=Platform.OS==='ios'&&!reduceTransparency&&isGlassEffectAPIAvailable()&&isLiquidGlassAvailable();
 if(reduceTransparency)return <View testID="material-opaque" style={[base,{backgroundColor:c.surface,borderWidth:1,borderColor:c.line},style]}>{children}</View>;
 const rim=<GlassRim strong={strong} radius={typeof radius==='number'?radius:24}/>;
 if(native)return <GlassView testID="material-native-glass" glassEffectStyle={strong?'clear':'regular'} isInteractive={strong} colorScheme={dark?'dark':'light'} tintColor={strong?(dark?'#CADDD51A':'#FFFFFF26'):(dark?'#0B17112C':'#FFFFFF40')} style={[base,style]}>
   {rim}{children}
  </GlassView>;
 // An opaque outer fill used to flatten the Android fallback even when a real
 // BlurTargetView existed. Keep content sampling, dark scrim and rim separate.
 return <View testID="material-blurred-glass" style={[base,{backgroundColor:target?'transparent':c.surface},style]}>
   <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <BlurView tint={dark?'dark':'light'} intensity={strong?28:35} blurTarget={target??undefined} blurMethod={Platform.OS==='android'&&target?'dimezisBlurViewSdk31Plus':'none'} style={StyleSheet.absoluteFill}/>
    <View style={[StyleSheet.absoluteFill,{backgroundColor:dark?(strong?'rgba(11,20,16,.30)':'rgba(9,18,13,.55)'):'rgba(248,250,246,.55)'}]}/>
   </View>{rim}{children}
  </View>;
}
function GlassRim({strong,radius}:{strong:boolean;radius:number}) {
 const {dark}=useTheme();
 return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
   <LinearGradient colors={dark?(strong?['rgba(237,247,240,.24)','rgba(187,217,203,.025)','rgba(17,26,21,.02)','rgba(232,237,224,.12)']:['rgba(222,242,232,.09)','rgba(15,25,20,.01)','rgba(226,232,222,.04)']):['rgba(255,255,255,.68)','rgba(247,251,247,.10)','rgba(255,255,255,.32)']} style={StyleSheet.absoluteFill}/>
   <View style={[StyleSheet.absoluteFill,{borderRadius:radius,borderWidth:StyleSheet.hairlineWidth,borderColor:dark?(strong?'rgba(231,245,237,.62)':'rgba(211,233,223,.23)'):'rgba(255,255,255,.85)'}]}/>
   {strong&&<View style={[StyleSheet.absoluteFill,{margin:1.5,borderRadius:Math.max(0,radius-1.5),borderWidth:StyleSheet.hairlineWidth,borderColor:dark?'rgba(232,246,237,.21)':'rgba(91,115,100,.17)'}]}/>}
  </View>;
}
/** The material compresses; glyphs only translate and retain their original shape.
 * The hit target stays fixed, and every cancellation/release restores the surface.
 */
export function Button({title,onPress,icon,variant='primary',busy=false,disabled=false,compact=false,style,testID,accessibilityLabel}:{title:string;onPress:()=>unknown;icon?:string;variant?:'primary'|'secondary'|'quiet'|'danger';busy?:boolean;disabled?:boolean;compact?:boolean;style?:StyleProp<ViewStyle>;testID?:string;accessibilityLabel?:string}) {
 const {c,reduceMotion}=useTheme();
 const pressure=useRef(new Animated.Value(0)).current;
 const locked=disabled||busy;
 const settle=useCallback((pressed:boolean)=>{
  pressure.stopAnimation();
  if(reduceMotion){pressure.setValue(0);return;}
  if(pressed)Animated.timing(pressure,{toValue:1,duration:90,easing:Easing.out(Easing.quad),useNativeDriver:true}).start();
  else Animated.spring(pressure,{toValue:0,stiffness:420,damping:28,mass:.55,restDisplacementThreshold:.001,restSpeedThreshold:.001,useNativeDriver:true}).start();
 },[pressure,reduceMotion]);
 useEffect(()=>{if(locked||reduceMotion){pressure.stopAnimation();pressure.setValue(0)}return()=>pressure.stopAnimation()},[locked,reduceMotion,pressure]);
 const translateY=pressure.interpolate({inputRange:[0,1],outputRange:[0,1.8]});
 return <View style={style}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel??title} accessibilityState={{disabled:locked,busy}} disabled={locked} testID={testID}
  onPressIn={()=>settle(true)} onPressOut={()=>settle(false)} onPress={()=>{void Haptics.selectionAsync().catch(()=>{});onPress()}}>
  {variant!=='quiet'&&<Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{transform:[{translateY},{scaleX:pressure.interpolate({inputRange:[0,1],outputRange:[1,1.012]})},{scaleY:pressure.interpolate({inputRange:[0,1],outputRange:[1,.948]})}]}]}>
   {variant==='danger'?<View style={[StyleSheet.absoluteFill,{borderRadius:26,borderWidth:1,borderColor:c.error}]}/>:<Glass strong={variant==='primary'} style={{flex:1,borderRadius:999}}/>}
  </Animated.View>}
  <Animated.View style={{paddingHorizontal:variant==='quiet'?10:compact?14:22,minHeight:variant==='primary'&&!compact?58:48,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',transform:[{translateY}],opacity:disabled?.48:1}}>
   {busy?<ActivityIndicator color={c.text}/>:icon?(icon==='plus'&&variant==='primary'&&!compact?<View style={{width:26,height:26,borderRadius:13,borderWidth:StyleSheet.hairlineWidth,borderColor:c.secondary,alignItems:'center',justifyContent:'center'}}><Icon name={icon} size={19}/></View>:<Icon name={icon} color={variant==='danger'?c.error:c.text} size={variant==='primary'&&!compact?24:19}/>):null}
   <Txt size={variant==='primary'&&!compact?18:15} weight={variant==='primary'?'600':'500'} tone={variant==='danger'?'error':variant==='quiet'?'secondary':'text'} style={{flexShrink:1,textAlign:'center'}}>{title}</Txt>
  </Animated.View>
 </Pressable></View>;
}
export function IconButton({name,label,onPress,selected=false}:{name:string;label:string;onPress:()=>unknown;selected?:boolean}){const {c}=useTheme();return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} onPress={()=>onPress()} style={{width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:24,backgroundColor:selected?c.line:'transparent'}}><Icon name={name} color={selected?c.protein:c.text}/></Pressable>}
export function Screen({title,subtitle,children,back=true,dock=true,tab,background=false,testID,headerRight,contentStyle,titleSize}:{title?:string;subtitle?:string;children?:React.ReactNode;back?:boolean;dock?:boolean;tab?:TabName;background?:boolean;testID?:string;headerRight?:React.ReactNode;contentStyle?:StyleProp<ViewStyle>;titleSize?:number}) {
 const {c,dark}=useTheme(),nav=useNav(),safe=useSafeAreaInsets();
 const backgroundRef=useRef<View|null>(null),contentRef=useRef<View|null>(null);
 const {register}=useDockBackdrop();
 useFocusEffect(useCallback(()=>register(contentRef),[register]));
 // The tab navigator owns the ONE dock. Screen only reserves its scroll clearance.
 // The dock's target contains an opaque painted scene, never a transparent sibling
 // which Android could composite against the Activity's white background.
 return <SurfaceBackdrop.Provider value={backgroundRef}>
  <View style={{flex:1,backgroundColor:c.background}} testID={testID}>
   <BlurTargetView ref={contentRef} style={{flex:1,backgroundColor:c.background}}>
    <BlurTargetView ref={backgroundRef} pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:c.background}]}>
     {background&&<><Image source={art.clean} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false}/><LinearGradient colors={dark?['rgba(5,10,8,.64)','rgba(4,10,7,.24)','rgba(4,10,7,.85)']:['rgba(248,247,241,.90)','rgba(248,247,241,.94)']} style={StyleSheet.absoluteFill}/></>}
    </BlurTargetView>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
     <ScrollView testID="screen-scroll" style={{flex:1}} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[{paddingTop:safe.top+12,paddingHorizontal:20,paddingBottom:tab?115+safe.bottom:32+safe.bottom,gap:18,flexGrow:1},contentStyle]}>
      {(title||back||headerRight)&&<View style={[layout.row,{alignItems:'flex-start'}]}>{back&&<IconButton name="back" label="Volver" onPress={nav.back}/>}<View style={{flex:1,paddingTop:back?5:3}}>{title&&<Txt size={titleSize??(back?24:32)} weight="600">{title}</Txt>}{subtitle&&<Txt tone="secondary" size={14} style={{marginTop:5}}>{subtitle}</Txt>}</View>{headerRight}</View>}
      {children}
     </ScrollView>
     <KeyboardDismissBar/>
    </KeyboardAvoidingView>
   </BlurTargetView>
  </View>
 </SurfaceBackdrop.Provider>;
}
export function Dock({active,onSelect,onLongPress}:{active:TabName|'register';onSelect?:(tab:TabName)=>void;onLongPress?:(tab:TabName)=>void}) {
 const safe=useSafeAreaInsets(),nav=useNav(),{c,reduceMotion}=useTheme();const {target}=useDockBackdrop();
 const items:{tab:TabName|null;label:string;icon:string}[]=[{tab:'home',label:'Hoy',icon:'home'},{tab:'recipes',label:'Recetas',icon:'recipes'},{tab:null,label:'Registrar',icon:'plus'},{tab:'train',label:'Entrenar',icon:'train'},{tab:'progress',label:'Progreso',icon:'progress'}];
 const index=items.findIndex(i=>i.tab===active||i.tab===null&&active==='register');
 const [trackWidth,setTrackWidth]=useState(0);
 const x=useRef(new Animated.Value(0)).current;
 const itemWidth=Math.max(0,(trackWidth-10)/5);
 useEffect(()=>{const destination=Math.max(0,index)*itemWidth;x.stopAnimation();if(reduceMotion||!itemWidth)x.setValue(destination);else Animated.spring(x,{toValue:destination,stiffness:360,damping:30,mass:.72,useNativeDriver:true}).start();return()=>x.stopAnimation()},[index,itemWidth,reduceMotion,x]);
 return <View testID="cuki-dock" pointerEvents="box-none" style={{position:'absolute',left:0,right:0,bottom:0,height:88+Math.max(safe.bottom,10),paddingHorizontal:12,paddingTop:5,paddingBottom:Math.max(safe.bottom,10),zIndex:20}}>
  <View testID="dock-material-track" onLayout={event=>setTrackWidth(event.nativeEvent.layout.width)}>
   <Glass blurTarget={target} style={{borderRadius:38,padding:5,flexDirection:'row',alignItems:'center'}}>
    {itemWidth>0&&index>=0&&<Animated.View testID="dock-active-lens" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{position:'absolute',left:5,top:5,width:itemWidth,height:68,transform:[{translateX:x}]}}>
      <Glass strong blurTarget={target} style={{flex:1,borderRadius:31}}/>
     </Animated.View>}
    {items.map(i=>{const selected=i.tab===active||i.tab===null&&active==='register';return <Pressable key={i.label} testID={'nav-'+(i.tab??'register')} accessibilityRole={i.tab?'tab':'button'} accessibilityLabel={i.label} accessibilityState={{selected}} style={{flex:1,minHeight:68}} onPress={()=>i.tab?(onSelect??nav.tab)(i.tab):nav.register()} onLongPress={()=>i.tab&&onLongPress?.(i.tab)}>
      <View pointerEvents="none" style={{height:68,alignItems:'center',justifyContent:'center',gap:5}}>
       {i.tab===null?<View style={{borderRadius:23,borderWidth:1,borderColor:c.line,width:38,height:38,alignItems:'center',justifyContent:'center'}}><Icon name="plus" size={25}/></View>:<Icon name={i.icon} size={25} filled={selected} color={selected?c.text:c.secondary}/>}
       <Txt size={11} weight={selected?'600':'400'} tone={selected?'text':'secondary'}>{i.label}</Txt>
      </View>
     </Pressable>})}
   </Glass>
  </View>
 </View>;
}
export function Field({label,hint,...props}:TextInputProps&{label:string;hint?:string}){const {c}=useTheme();return <View style={{gap:7}}><Txt size={14} weight="500">{label}</Txt><TextInput {...props} accessibilityLabel={props.accessibilityLabel??label} placeholderTextColor={c.muted} selectionColor={c.protein} style={[{color:c.text,backgroundColor:c.surface,borderWidth:1,borderColor:c.line,borderRadius:15,paddingHorizontal:14,paddingVertical:12,minHeight:50,fontSize:16,textAlignVertical:props.multiline?'top':'center'},props.multiline&&{minHeight:100},props.style]}/>{hint&&<Txt tone="muted" size={12}>{hint}</Txt>}</View>}
export const NumberField=(props:TextInputProps&{label:string;hint?:string})=><Field {...props} keyboardType="decimal-pad"/>;
export function Toggle({label,detail,value,onChange}:{label:string;detail?:string;value:boolean;onChange:(value:boolean)=>unknown}){const {c}=useTheme();return <View style={layout.between}><View style={{flex:1,gap:4}}><Txt size={15}>{label}</Txt>{detail&&<Txt size={12} tone="secondary">{detail}</Txt>}</View><Switch accessibilityLabel={label} value={value} onValueChange={v=>{onChange(v)}} trackColor={{false:c.line,true:c.protein}} thumbColor={value?'#163124':'#E7EDE8'}/></View>}
export function Chips<T extends string>({options,value,onChange}:{options:{value:T;label:string}[];value:T;onChange:(value:T)=>unknown}){const {c}=useTheme();return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{flexGrow:0,flexShrink:0}} contentContainerStyle={{gap:8,paddingVertical:2,alignItems:'center'}}>{options.map(o=><Pressable key={o.value} accessibilityRole="button" accessibilityLabel={o.label} accessibilityState={{selected:o.value===value}} onPress={()=>onChange(o.value)} style={{minHeight:44,paddingHorizontal:15,justifyContent:'center',borderWidth:1,borderColor:o.value===value?c.protein:c.line,borderRadius:24,backgroundColor:o.value===value?c.line:'transparent'}}><Txt size={13}>{o.label}</Txt></Pressable>)}</ScrollView>}
export function Segments<T extends string>(props:{options:{value:T;label:string}[];value:T;onChange:(v:T)=>unknown}){return <Glass style={{borderRadius:28,padding:4,flexDirection:'row'}}>{props.options.map(o=><Pressable key={o.value} accessibilityRole="tab" accessibilityState={{selected:o.value===props.value}} style={{flex:1}} onPress={()=>props.onChange(o.value)}>{o.value===props.value?<Glass strong style={{borderRadius:24,paddingVertical:12,paddingHorizontal:6}}><Txt size={13} weight="600" style={{textAlign:'center'}}>{o.label}</Txt></Glass>:<View style={{paddingVertical:12,paddingHorizontal:6}}><Txt size={13} tone="secondary" style={{textAlign:'center'}}>{o.label}</Txt></View>}</Pressable>)}</Glass>}
export function Row({title,subtitle,leading,trailing,onPress}:{title:string;subtitle?:string;leading?:React.ReactNode;trailing?:React.ReactNode;onPress?:()=>unknown}){const {c}=useTheme();const inner=<View style={[layout.row,{minHeight:62,paddingVertical:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.line}]}>{leading}<View style={{flex:1,gap:4}}><Txt size={16} weight="500">{title}</Txt>{subtitle&&<Txt size={13} tone="secondary">{subtitle}</Txt>}</View>{trailing??(onPress?<Icon name="chevron" size={18} color={c.secondary}/>:null)}</View>;return onPress?<Pressable accessibilityRole="button" accessibilityLabel={title} onPress={()=>onPress()}>{inner}</Pressable>:inner}
export function Card({children,style}:{children?:React.ReactNode;style?:StyleProp<ViewStyle>}){const {c}=useTheme();return <View style={[{padding:18,borderRadius:24,backgroundColor:c.surface,gap:12},style]}>{children}</View>}
export function Section({title,children,action,onAction}:{title:string;children?:React.ReactNode;action?:string;onAction?:()=>unknown}){return <View style={{gap:12}}><View style={layout.between}><Txt size={21} weight="600" style={{flex:1}}>{title}</Txt>{action&&onAction&&<Pressable accessibilityRole="button" accessibilityLabel={action} onPress={()=>onAction()} style={{minHeight:44,justifyContent:'center'}}><Txt size={13} tone="secondary">{action} →</Txt></Pressable>}</View>{children}</View>}
export function Message({children,type='info'}:{children?:React.ReactNode;type?:'info'|'error'|'success'|'warning'}){const {c}=useTheme();if(children===null||children===undefined||children==='')return null;return <View accessibilityLiveRegion={type==='error'?'assertive':'polite'} style={{borderLeftWidth:2,borderLeftColor:type==='error'?c.error:type==='success'?c.protein:c.line,paddingLeft:12,paddingVertical:7}}><Txt tone={type==='error'?'error':'secondary'} size={13}>{children}</Txt></View>}
export function Empty({title,detail,action,onPress}:{title:string;detail:string;action?:string;onPress?:()=>unknown}){return <View style={{paddingVertical:24,gap:12}}><Txt size={23} weight="600">{title}</Txt><Txt tone="secondary">{detail}</Txt>{action&&onPress&&<Button title={action} variant="secondary" onPress={onPress}/>}</View>}
export function CloudNotice(){const {api,identity}=useApp();return !api.configured?<Message>Guardado en tu dispositivo. La sincronización necesita configurar el servidor.</Message>:!identity?<Message>Explorás como invitado. Iniciá sesión para sincronizar o publicar.</Message>:null}
export function Ring({value,goal,size=150}:{value:number|null;goal?:number|null;size?:number}){const {c}=useTheme();const stroke=10,r=(size-stroke)/2,circ=2*Math.PI*r;const hasGoal=goal!=null&&goal>0,p=hasGoal&&value!=null?Math.min(1,Math.max(0,value/goal)):0;return <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}} accessibilityLabel={`${fmt(value)} calorías${hasGoal?` de ${fmt(goal)}`:''}`}><Svg testID="nutrition-ring-vector" accessible={false} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFill}><Defs><SVGGradient id="progress-ring" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#B7F5DC"/><Stop offset="1" stopColor="#66BF84"/></SVGGradient></Defs><Circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c.line} strokeWidth={stroke}/>{p>0&&<Circle cx={size/2} cy={size/2} r={r} fill="none" stroke="url(#progress-ring)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circ*p} ${circ}`} rotation={-90} origin={`${size/2}, ${size/2}`}/>}</Svg><Txt size={size*.22} weight="600">{fmt(value)}</Txt><Txt size={size*.076} tone="secondary">{hasGoal?`de ${fmt(goal)} kcal`:'kcal registradas'}</Txt></View>}
export function MacroRow({nutrients,showEnergy=true}:{nutrients:Nutrients;showEnergy?:boolean}){const {state}=useApp();const {c}=useTheme();const options=[...(showEnergy&&state.profile.showCalories?[{label:'kcal',key:'energy' as const,color:c.fat}]:[]),{label:'P',key:'protein' as const,color:c.protein},{label:'C',key:'carbs' as const,color:c.carbs},{label:'G',key:'fat' as const,color:c.fat}];return <View style={{flexDirection:'row',gap:12,flexWrap:'wrap'}}>{options.map(o=><View key={o.key} style={{gap:5,flexShrink:1}}><Txt size={13}>{o.label==='kcal'?`${fmt(nutrients[o.key])} kcal`:`${o.label} ${fmt(nutrients[o.key])} g`}</Txt>{o.label!=='kcal'&&<View style={{width:32,height:3,borderRadius:3,backgroundColor:o.color}}/>}</View>)}</View>}
export function DateControl({value,onChange}:{value:string;onChange:(v:string)=>unknown}){const change=(n:number)=>{const date=new Date((validDate(value)?value:localDate())+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);onChange(date.toISOString().slice(0,10))};return <View style={layout.row}><IconButton name="back" label="Día anterior" onPress={()=>change(-1)}/><View style={{flex:1}}><Field label="Fecha (AAAA-MM-DD)" value={value} onChangeText={onChange} maxLength={10}/></View><IconButton name="chevron" label="Día siguiente" onPress={()=>change(1)}/></View>}
export function useClock(period=1000){const {clockOverride}=useApp();const [now,setNow]=useState(Date.now());useEffect(()=>{if(clockOverride!==undefined)return;const t=setInterval(()=>setNow(Date.now()),period);return()=>clearInterval(t)},[period,clockOverride]);return clockOverride??now}
export function Timer({deadline,label='Descanso'}:{deadline:number|null|undefined;label?:string}){const now=useClock();return <View style={{alignItems:'center',padding:25,gap:8}}><Txt size={60} weight="500">{duration(deadline?Math.max(0,(deadline-now)/1000):0)}</Txt><Txt tone="secondary">{label}</Txt>{deadline!=null&&deadline<=now&&<Txt tone="protein">Podés continuar cuando estés preparado.</Txt>}</View>}
export function confirm(title:string,message:string,action:()=>unknown,destructive=false){Alert.alert(title,message,[{text:'Cancelar',style:'cancel'},{text:destructive?'Eliminar':'Confirmar',style:destructive?'destructive':'default',onPress:()=>action()}])}
