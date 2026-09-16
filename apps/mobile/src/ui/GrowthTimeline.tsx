import React from 'react';
import {Pressable,View} from 'react-native';
import Svg,{Path} from 'react-native-svg';
import type {GardenWeek} from '../../../../packages/core/types';
import {useTheme} from './theme';
/** One accessible touch target opens the complete week selector. The 52 decorative
 * leaves are progress marks, not 52 impossibly small buttons. */
export function GrowthTimeline({weeks,onPress}:{weeks:GardenWeek[];onPress:()=>void}){
 const {c}=useTheme();const credited=weeks.filter(w=>w.state==='credited').length;
 return <Pressable testID="garden-growth-timeline" accessibilityRole="button" accessibilityLabel={`Ver las ${weeks.length} semanas; ${credited} acreditadas`} onPress={onPress} style={{minHeight:44,justifyContent:'center'}}>
  <View pointerEvents="none" accessible={false} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>{weeks.map(w=>{
   const color=w.state==='credited'?c.protein:w.state==='open'||w.state==='awaiting_sync'?c.warning:c.muted;
   return <Svg key={w.index} width={5} height={14} viewBox="0 0 8 18" accessible={false}><Path d="M4 17C-1 13 0 6 6 1C9 8 8 14 4 17Z" fill={w.state==='future'?'none':color} fillOpacity={w.state==='missed'?.35:1} stroke={color} strokeWidth={.8}/></Svg>;
  })}</View>
 </Pressable>;
}
