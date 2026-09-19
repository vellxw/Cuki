import {nextWorkout} from '../../../../packages/core/workout-calendar';
import React, { useState } from 'react';
import { View, Pressable, useWindowDimensions, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp, useTask } from '../data/AppProvider';
import { Screen, Txt, Title, Button, IconButton, Message, Row, Ring, MacroRow, Section, Empty, useNav, DateControl, confirm, type ScreenProps, art, useClock } from '../ui/components';
import { Plant } from '../ui/Plant';
import { Icon } from '../ui/Icon';
import { layout, useTheme } from '../ui/theme';
import { dayNutrition, goalAt, fmt, prettyDate, localDate } from '../../../../packages/core/utils';
import { MEALS, type Meal } from '../../../../packages/core/types';
// Composition follows the approved Home: ring left, live plant right, centered
// register control, then one next action. Empty-state values stay real, never demo data.
export function Home({params = {}}: Partial<ScreenProps>) {
  const {state} = useApp();
  const nav = useNav();
  const {width, fontScale} = useWindowDimensions();
  const {c} = useTheme();
  const calories = dayNutrition(state, state.selectedDate);
  const goal = goalAt(state, state.selectedDate);
  const garden = state.garden;
  const week = garden?.creditedWeeks ?? 0;
  const active = state.sessions.find(s => s.status === 'active' || s.status === 'paused');
  const now=useClock(60000);
  const today=localDate(new Date(now),state.profile.timezone);
  const upcoming=nextWorkout(state.plans,state.sessions,state.selectedDate);
  const plannedLabel=upcoming?.date?(upcoming.date===today?'Hoy':prettyDate(upcoming.date))+' · ':'';
  const collapsed = width < 370 || fontScale > 1.3;
  const macros = [
    {label: 'P', key: 'protein' as const, color: c.protein},
    {label: 'C', key: 'carbs' as const, color: c.carbs},
    {label: 'G', key: 'fat' as const, color: c.fat},
  ];
  return <Screen back={false} dock={false} tab="home" background testID="SC-07" contentStyle={{gap:14}}>
    <View style={[layout.between, {paddingTop: 2, alignItems: 'flex-start'}]}>
      <View style={{flex: 1}}>
        <Txt size={23} style={{lineHeight:28}}>Buenos días{state.profile.name ? ',' : ''}</Txt>
        {state.profile.name && <Txt size={31} weight="600" style={{lineHeight:35}}>{state.profile.name}</Txt>}
        <Txt tone="secondary" size={12} style={{marginTop: 7,lineHeight:16}}>Disciplina hoy,{"\n"}un mejor mañana.</Txt>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil y ajustes" onPress={() => nav.go('SC-68')}
        style={{width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.line,
          backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center'}}>
        <Txt weight="500" size={14}>{state.profile.name ? state.profile.name.slice(0,2).toUpperCase() : 'Vos'}</Txt>
      </Pressable>
    </View>
    <View testID="home-hero" style={{flexDirection: collapsed ? 'column' : 'row', gap: 12,
      alignItems: collapsed ? 'stretch' : 'flex-start', minHeight: collapsed ? undefined : garden ? 236 : 244,
      marginTop: 2}}>
      <View style={{flex: collapsed ? undefined : 1, gap: 8, alignItems: collapsed ? 'center' : 'flex-start'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir diario de nutrición" onPress={() => nav.go('SC-08')}
          style={{flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44}}>
          <Icon name="nutrition" color={c.text} size={17}/><Txt size={12}>{state.selectedDate===today?'Nutrición de hoy':'Nutrición · '+prettyDate(state.selectedDate)}</Txt><Icon name="chevron" size={13}/>
        </Pressable>
        {state.profile.showCalories ? <Ring value={calories.energy} goal={goal?.energy} size={Math.min(148,(width-40)*.415)}/>
          : <Txt size={20} weight="600">Tu diario, sin calorías</Txt>}
        <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 1}}>
          {macros.map(m => {
            const value=calories[m.key], target=goal?.[m.key];
            const ratio=value!==null && target!=null && target>0 ? Math.min(1,Math.max(0,value/target)) : 0;
            return <View key={m.key} style={{minWidth: 43, gap: 6}}>
              <Txt size={11.5}>{m.label} {fmt(value)} g</Txt>
              <View accessible={true} accessibilityRole="progressbar" accessibilityLabel={`${m.label}: ${value===null?'sin datos':fmt(value)+' gramos'}${target?' de '+fmt(target):', sin meta configurada'}`}
                accessibilityValue={target && value!==null ? {min:0,max:target,now:Math.min(value,target)} : undefined}
                style={{width:40,height:4,borderRadius:4,backgroundColor:c.line,overflow:'hidden'}}>
                <View style={{width:`${ratio*100}%`,height:4,backgroundColor:m.color,borderRadius:4}}/>
              </View>
            </View>;
          })}
        </View>
      </View>
      {!state.profile.hideGarden && <View style={{flex:collapsed?undefined:1.08,alignItems:'center',
        minHeight:collapsed?undefined:236,overflow:'visible'}}>
        <View pointerEvents="none" style={collapsed ? {width:'100%',height:286} :
          {position:'absolute',top:-80,left:-15,right:-15,height:310}}>
          <Plant seed={garden?.plant.seed??state.localPlantSeed} weeks={week} height={collapsed?286:310}/>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver tu jardín" onPress={() => nav.go('SC-79')}
          style={{alignSelf:'stretch',gap:7,marginTop:collapsed?0:146,minHeight:80}}>
          <View style={[layout.row,{gap:7}]}><Icon name="leaf" color={c.protein} size={17}/><Txt size={14}>Tu planta</Txt></View>
          <Txt size={12} tone="secondary">{garden?`Semana ${week} de 52`:'Tu historia empieza con una semilla'}</Txt>
          <View style={{height:6,borderRadius:6,backgroundColor:c.line,overflow:'hidden'}}>
            <View style={{height:6,width:`${week/52*100}%`,backgroundColor:c.protein,borderRadius:6}}/>
          </View>
          <Txt size={11} tone="secondary">{garden?.state==='interrupted'?'Tu planta se conserva. Podés empezar otro ciclo.':garden?
            '1 entrenamiento esta semana mantiene tu crecimiento.':'Plantá tu primer ciclo cuando estés listo.'}</Txt>
        </Pressable>
      </View>}
    </View>
    <Button title="Registrar +" icon="plus" onPress={() => nav.register({date:state.selectedDate})} testID="home-register"
      style={{alignSelf:'center',width:collapsed?'100%':'70%',minWidth:220,marginTop:0,marginBottom:4}}/>
    <View style={{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:c.line,paddingTop:16,gap:7}}>
      <View style={layout.row}><Icon name="train" size={18}/><Txt size={13} tone="secondary">{active?'Sesión en curso':'Siguiente entrenamiento'}</Txt></View>
      <Txt size={23} weight="600">{active?active.name:upcoming?plannedLabel+upcoming.day.name:'Construí tu rutina'}</Txt>
      {active?<Txt size={13} tone="secondary">{active.exercises.length} ejercicios · tus series están guardadas</Txt>
        :upcoming?<View style={[layout.wrap,{gap:14}]}>
          {upcoming.time&&<View style={[layout.row,{gap:7}]}><Icon name="clock" size={19}/><Txt size={13} tone="secondary">{upcoming.time}</Txt></View>}
          <View style={[layout.row,{gap:7}]}><Icon name="list" size={19}/><Txt size={13} tone="secondary">{upcoming.day.exercises.length} ejercicios</Txt></View>
        </View>:<Txt size={13} tone="secondary">Elegí ejercicios, series y días a tu medida.</Txt>}
      <Button title={active?'Reanudar sesión':upcoming?'Ver rutina':'Crear rutina'} icon="arrow" variant="secondary" testID="home-next-workout"
        onPress={() => active?nav.go(active.restDeadline?'SC-48':'SC-47',{id:active.id}):upcoming?nav.go('SC-42',{planId:upcoming.plan.id,dayId:upcoming.day.id,date:upcoming.date??undefined}):nav.go('SC-44')}
        style={{alignSelf:'flex-start'}}/>
    </View>
    <View style={layout.wrap}><Button title="Diario" variant="quiet" onPress={() => nav.go('SC-08')}/>
      <Button title="Mi semana" variant="quiet" onPress={() => nav.go('SC-36')}/>
      {!goal&&<Button title="Configurar metas opcionales" variant="quiet" onPress={() => nav.go('SC-04')}/>}</View>
  </Screen>;
}
export function Diary() {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [deleted, setDeleted] = useState<string | null>(null);
  const [dateText, setDateText] = useState(state.selectedDate);
  const entries = state.diary.filter(e => e.date === state.selectedDate && !e.deletedAt);
  const totals = dayNutrition(state, state.selectedDate);
  return <Screen title="Tu diario" subtitle="Cada registro conserva los nutrientes de su versión original." testID="SC-08"><DateControl value={dateText} onChange={value => {
      setDateText(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) void task.run(() => repo.dispatch({
        type: 'date',
        date: value
      }));
    }} /><MacroRow nutrients={totals} /><Button title="Añadir alimento" icon="plus" onPress={() => nav.register({
      date: state.selectedDate
    })} />{(Object.keys(MEALS) as Meal[]).map(meal => <Section key={meal} title={MEALS[meal]} action="Añadir" onAction={() => nav.register({
      date: state.selectedDate,
      meal
    })}>{entries.filter(e => e.meal === meal).length ? entries.filter(e => e.meal === meal).map(e => <Row key={e.id} title={e.name} subtitle={`${fmt(e.amount, 1)} ${e.unit === 'serving' ? 'porciones' : e.unit === 'ml' ? 'ml' : 'g'} · ${fmt(e.nutrition.energy)} kcal`} onPress={() => nav.go('SC-12', {
        entryId: e.id
      })} trailing={<IconButton name="trash" label={`Eliminar ${e.name}`} onPress={() => confirm('Eliminar registro', 'Podés deshacerlo sin volver a calcular nutrientes.', () => task.run(async () => {
        await repo.dispatch({
          type: 'deleteEntry',
          id: e.id
        });
        setDeleted(e.id);
      }), true)} />} />) : <Txt tone="muted" size={14}>Sin registros en esta comida.</Txt>}</Section>)}{deleted && <Button title="Deshacer eliminación" variant="secondary" onPress={() => task.run(async () => {
      await repo.dispatch({
        type: 'restoreEntry',
        id: deleted
      });
      setDeleted(null);
    })} />}<Button title="Ver tendencias" variant="quiet" onPress={() => nav.go('SC-58')} /><Message type="error">{task.error}</Message></Screen>;
}
export const homeScreens = {
  'SC-07': Home,
  'SC-08': Diary
};