import {RecipeVote} from '../ui/RecipeVote';
import { editorDraftKey } from '../../../../packages/core/navigation';
import { fetchRecipes, fetchComments } from '../data/community';
import React, { useState } from 'react';
import { View, Pressable, Share, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useKeepAwake } from 'expo-keep-awake';
import { useApp, useDraft, useTask } from '../data/AppProvider';
import { choosePhoto } from '../native/io';
import { Screen, Txt, Title, Button, IconButton, Field, NumberField, Toggle, Chips, Segments, Row, Message, Empty, Section, Card, Glass, MacroRow, Timer, useNav, confirm, CloudNotice, art, type ScreenProps } from '../ui/components';
import { Icon } from '../ui/Icon';
import { layout, useTheme } from '../ui/theme';
import { uid, fmt, normalize, numberInput, invariant, recipeNutrition, scaleNutrients, duration } from '../../../../packages/core/utils';
import type { Recipe, RecipeStep, Meal, Comment } from '../../../../packages/core/types';
import { MEALS } from '../../../../packages/core/types';
import { newRecipeDraft, type RecipeDraft } from './drafts';
export function RecipeMedia({
  recipe,
  height = 260
}: {
  recipe: Recipe;
  height?: number;
}) {
  const {
    c
  } = useTheme();
  if (recipe.photoUri || recipe.assetKey) return <Image source={recipe.photoUri ? {
    uri: recipe.photoUri
  } : art.bowl} contentFit="cover" style={{
    height,
    width: '100%',
    borderRadius: 24
  }} accessibilityLabel={`Foto de ${recipe.title}${recipe.assetKey ? ', ilustración editorial generada' : ''}`} />;
  return <View style={{
    height: height * .55,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    gap: 12
  }}><Icon name="recipes" color={c.protein} size={40} /><Txt tone="muted">Receta sin fotografía</Txt></View>;
}
export function RecipeCard({recipe,onPress,compact=false}:{recipe:Recipe;onPress:()=>void;compact?:boolean}) {
  const {state,repo}=useApp(),task=useTask();
  return <Glass style={{borderRadius:24,padding:7,gap:7}}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Ver receta ${recipe.title}`}>
      <View style={{borderRadius:18,overflow:'hidden'}}>
        <RecipeMedia recipe={recipe} height={compact?118:204}/>
        {!compact&&<><LinearGradient pointerEvents="none" colors={['rgba(3,8,5,.48)','rgba(3,8,5,0)','rgba(3,8,5,.92)']} locations={[0,.38,1]} style={StyleSheet.absoluteFill}/>
          <View pointerEvents="none" style={{position:'absolute',top:12,left:12,right:122}}><Txt size={12} weight="600">{recipe.visibility==='editorial'?'CUKI Editorial':recipe.authorName}</Txt></View>
          <View pointerEvents="none" style={{position:'absolute',left:12,right:12,bottom:12,gap:4}}><Txt size={22} weight="600">{recipe.title}</Txt><Txt size={12} tone="secondary">{recipe.minutes>0?`${recipe.minutes} min`:'Tiempo no indicado'} · {recipe.visibility==='editorial'?'Receta original':'Receta de la comunidad'}</Txt></View></>}
      </View>
      {compact&&<View style={{gap:4,padding:7}}><Txt size={15} weight="600">{recipe.title}</Txt><Txt size={11} tone="secondary">{recipe.minutes} min · {fmt(recipeNutrition(recipe,state.foods).protein)} g de proteína</Txt></View>}
    </Pressable>
    {!compact&&<View style={{position:'absolute',top:14,right:14}}><RecipeVote recipe={recipe}/></View>}
    {!compact&&<View style={{flexDirection:'row',alignItems:'center',gap:5,paddingLeft:8}}><View style={{flex:1}}><MacroRow nutrients={recipeNutrition(recipe,state.foods)}/></View><IconButton name="save" label={`Guardar receta ${recipe.title}`} selected={state.savedRecipeIds.includes(recipe.id)} onPress={()=>task.run(()=>repo.dispatch({type:'toggle',field:'savedRecipeIds',id:recipe.id}))}/></View>}
    <Message type="error">{task.error}</Message>
  </Glass>;
}
interface RecipeFilters {
  exclude: string;
  include: string;
  maxMinutes: string;
  proteinOnly: boolean;
  equipment: string;
}
const filterInitial = (): RecipeFilters => ({
  exclude: '',
  include: '',
  maxMinutes: '',
  proteinOnly: false,
  equipment: ''
});
function filterRecipes(recipes: Recipe[], query: string, filters: RecipeFilters, foodNames: Map<string, string>) {
  const excluded = filters.exclude.split(',').map(normalize).filter(Boolean),
    included = filters.include.split(',').map(normalize).filter(Boolean);
  const max = Number(filters.maxMinutes) || Infinity;
  return recipes.filter(r => {
    const ingredients = r.ingredients.map(i => normalize(foodNames.get(i.foodId) ?? ''));
    const hay = normalize([r.title, r.description, r.authorName, ...ingredients].join(' '));
    return hay.includes(normalize(query)) && r.minutes <= max && !excluded.some(x => ingredients.some(n => n.includes(x))) && included.every(x => ingredients.some(n => n.includes(x))) && (!filters.equipment || normalize(r.description + ' ' + r.tags.join(' ')).includes(normalize(filters.equipment)));
  });
}
export function RecipesHome() {
  const {
    state,
    api,
    repo
  } = useApp();
  const refreshTask = useTask();
  const nav = useNav();
  const [f, setF] = useState('all');
  const recipes = state.recipes.filter(r => !state.blockedIds.includes(r.authorId)).filter(r => f === 'quick' ? r.minutes <= 20 : f === 'saved' ? state.savedRecipeIds.includes(r.id) : true);
  return <Screen back={false} dock={false} tab="recipes" background testID="SC-23" contentStyle={{gap:12}}><Title>Recetas</Title><Txt size={12} tone="secondary" style={{marginTop:-5}}>Cociná. Compartí. Inspirá.</Txt><Button title="Buscar recetas e ingredientes" icon="search" variant="secondary" onPress={() => nav.go('SC-24')} /><Chips options={[{
      value: 'all',
      label: 'Para descubrir'
    }, {
      value: 'quick',
      label: 'Rápidas'
    }, {
      value: 'saved',
      label: 'Guardadas'
    }]} value={f} onChange={setF} />{recipes[0] ? <RecipeCard recipe={recipes[0]} onPress={() => nav.go('SC-26', {
      id: recipes[0].id
    })} /> : <Empty title="Armá tu colección" detail="Guardá recetas para encontrarlas aquí." />}<Section title="Para vos" action="Ver todas" onAction={()=>nav.go('SC-24')}><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexGrow:0,flexShrink:0}} contentContainerStyle={{gap:10,alignItems:'flex-start'}}>{recipes.slice(1,5).map(r=><View key={r.id} style={{width:164}}><RecipeCard compact recipe={r} onPress={()=>nav.go('SC-26',{id:r.id})}/></View>)}</ScrollView></Section><Button title="Actualizar recetas de la comunidad" variant="quiet" busy={refreshTask.busy} onPress={() => refreshTask.run(() => fetchRecipes(api, repo))} /><Message type="error">{refreshTask.error}</Message><Button title="Crear mi receta" icon="plus" onPress={() => nav.go('SC-32')} /><Button title="Mis colecciones" variant="quiet" onPress={() => nav.go('SC-31')} /><View style={{
      height: 90
    }} /></Screen>;
}
export function RecipeSearch({
  params
}: ScreenProps) {
  const {
    state,
    api,
    repo
  } = useApp();
  const remoteTask = useTask();
  const [cursor, setCursor] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const nav = useNav();
  const d = useDraft('recipe-search', () => ({
    query: ''
  }));
  const filters = state.drafts['recipe-filters'] as RecipeFilters | undefined ?? filterInitial();
  const names = new Map(state.foods.map(f => [f.id, f.name]));
  const items = filterRecipes(state.recipes.filter(r => !state.blockedIds.includes(r.authorId)), d.value.query, filters, names).filter(r => !filters.proteinOnly || (recipeNutrition(r, state.foods).protein ?? 0) >= 25);
  return <Screen title="Buscar recetas" tab="recipes" testID="SC-24"><Field label="Receta, ingrediente o autor" value={d.value.query} onChangeText={query => d.set({
      query
    })} /><Button title="Buscar en la comunidad" busy={remoteTask.busy} variant="secondary" onPress={() => remoteTask.run(async () => {
      const p = await fetchRecipes(api, repo, d.value.query);
      setCursor(p.cursor);
      setSearched(true);
    })} />{searched && cursor && <Button title="Cargar más recetas" variant="quiet" busy={remoteTask.busy} onPress={() => remoteTask.run(async () => setCursor((await fetchRecipes(api, repo, d.value.query, cursor)).cursor))} />}<Message type="error">{remoteTask.error}</Message><Button title="Filtros" icon="filter" variant="secondary" onPress={() => nav.go('SC-25')} />{items.map(r => <Row key={r.id} title={r.title} subtitle={`${r.minutes} min · ${fmt(recipeNutrition(r, state.foods).protein, 1)} g de proteína/porción`} onPress={() => params.mode === 'plan' ? nav.go('SC-41', {
      ...params,
      recipeId: r.id
    }) : nav.go('SC-26', {
      ...params,
      id: r.id
    })} />)}{!items.length && <Empty title="Sin recetas con estos filtros" detail="Quitá alguna restricción o buscá por otro ingrediente." />}<Button title="Crear receta" variant="quiet" onPress={() => nav.go('SC-32')} /><Message type="error">{d.error}</Message></Screen>;
}
export function RecipeFilterScreen() {
  const nav = useNav();
  const d = useDraft<RecipeFilters>('recipe-filters', filterInitial);
  const task = useTask();
  return <Screen title="Filtrar recetas" tab="recipes" testID="SC-25"><Field label="Debe incluir" hint="Ingredientes separados por comas." value={d.value.include} onChangeText={include => d.set({
      include
    })} /><Field label="Excluir ingredientes" value={d.value.exclude} onChangeText={exclude => d.set({
      exclude
    })} /><NumberField label="Máximo de minutos, opcional" value={d.value.maxMinutes} onChangeText={maxMinutes => d.set({
      maxMinutes
    })} /><Field label="Equipo o técnica, opcional" value={d.value.equipment} onChangeText={equipment => d.set({
      equipment
    })} /><Toggle label="Al menos 25 g de proteína por porción" value={d.value.proteinOnly} onChange={proteinOnly => d.set({
      proteinOnly
    })} /><Message>Los filtros usan los ingredientes declarados. No garantizan ausencia de alérgenos ni contaminación cruzada.</Message><Button title="Aplicar filtros" onPress={() => task.run(async () => {
      if (d.value.maxMinutes) numberInput(d.value.maxMinutes, {
        min: 1,
        max: 1440
      });
      await d.flush();
      nav.back();
    })} /><Button title="Restablecer filtros" variant="quiet" onPress={() => d.set(filterInitial())} /><Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function RecipeDetail({
  params
}: ScreenProps) {
  const {
    state,
    repo,
    identity
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const r = state.recipes.find(r => r.id === params.id);
  const [tab, setTab] = useState('ingredients');
  const [portion, setPortion] = useState(1);
  const [aboutOpen,setAboutOpen]=useState(false);
  const {c}=useTheme();
  const {fontScale,width}=useWindowDimensions();
  const stackActions=fontScale>1.3||width<350;
  if (!r) return <Screen title="Receta" tab="recipes"><Empty title="Receta no disponible" detail="El registro de una receta retirada se conserva en tu diario." action="Buscar" onPress={() => nav.replace('SC-24')} /></Screen>;
  const nutrition = recipeNutrition(r, state.foods, portion);
  const comments = state.comments.filter(c => c.recipeId === r.id && c.state !== 'deleted' && !state.blockedIds.includes(c.authorId));
  return <Screen back={false} tab="recipes" background testID="SC-26" contentStyle={{gap:10}}>
    <View style={{borderRadius:26,overflow:'hidden'}}>
      <RecipeMedia recipe={r} height={260*Math.min(fontScale,1.5)}/>
      <LinearGradient pointerEvents="none" colors={['rgba(3,8,5,.5)','rgba(3,8,5,.04)','rgba(3,8,5,.95)']} locations={[0,.30,1]} style={StyleSheet.absoluteFill}/>
      <View style={{position:'absolute',top:3,left:3,right:3,flexDirection:'row',justifyContent:'space-between'}}>
        <IconButton name="back" label="Volver" onPress={nav.back}/>
        <View style={{flexDirection:'row'}}><IconButton name="save" label="Guardar receta" selected={state.savedRecipeIds.includes(r.id)} onPress={()=>task.run(()=>repo.dispatch({type:'toggle',field:'savedRecipeIds',id:r.id}))}/>
          <IconButton name="share" label="Compartir receta" onPress={()=>Share.share({title:r.title,message:[r.title,r.description,...r.ingredients.map(i=>{const f=i.snapshot??state.foods.find(f=>f.id===i.foodId);return `${f?.name??'Ingrediente'}: ${fmt(i.grams,1)} ${f?.basis==='per_100ml'?'ml':'g'}`}),...r.steps.map((step,i)=>`${i+1}. ${step.text}`)].join('\n')})}/></View>
      </View>
      <View style={{position:'absolute',bottom:12,left:14,right:14,gap:7}}>
        <Txt size={25} weight="600" style={{maxWidth:'90%'}}>{r.title}</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver autor ${r.authorName}`} onPress={()=>nav.go('SC-30',{authorId:r.authorId})} style={{minHeight:32,justifyContent:'center'}}>
          <Txt size={12} weight="500">{r.authorName}</Txt>
          <Txt size={10} tone="secondary">{r.visibility==='editorial'?'Receta original de CUKI':r.visibility==='private'?'Receta privada':r.visibility==='pending'?'Pendiente de revisión':'Publicación comunitaria'}</Txt>
        </Pressable>
        <Glass style={{paddingVertical:9,paddingHorizontal:11,borderRadius:16}}><MacroRow nutrients={nutrition}/></Glass>
      </View>
    </View>
    <View testID="recipe-registration-bar" style={{flexDirection:stackActions?'column':'row',alignItems:stackActions?'stretch':'center',gap:8}}>
      <Glass style={{flex:stackActions?undefined:1,borderRadius:25}}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
        <IconButton name="back" label="Reducir porción" onPress={()=>setPortion(v=>Math.max(.25,v-.25))}/>
        <Txt size={13} style={{flex:1,textAlign:'center'}}>{fmt(portion,2)} {portion===1?'porción':'porciones'}</Txt>
        <IconButton name="plus" label="Aumentar porción" onPress={()=>setPortion(v=>v+.25)}/>
      </View></Glass>
      <Button title="Registrar" compact icon="plus" accessibilityLabel="Registrar esta receta" style={{width:stackActions?'100%':137}} onPress={()=>nav.go('SC-12',{recipeId:r.id,servings:String(portion),date:params.date,meal:params.meal})}/>
    </View><Segments options={[{
      value: 'ingredients',
      label: 'Ingredientes'
    }, {
      value: 'steps',
      label: 'Preparación'
    }, {
      value: 'comments',
      label: 'Comentarios'
    }]} value={tab} onChange={setTab} />{tab === 'ingredients' ? <><View>{r.ingredients.map(i=>{
      const f=i.snapshot??state.foods.find(f=>f.id===i.foodId&&(!i.foodVersion||f.version===i.foodVersion));
      return <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={`${f?.name??'Fuente desconocida'}, ${fmt(i.grams*portion/r.servings,1)} ${f?.basis==='per_100ml'?'ml':'g'}`} onPress={()=>nav.go('SC-11',{foodId:i.foodId})} style={{flexDirection:'row',gap:12,alignItems:'center',minHeight:44,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.line,paddingVertical:6}}>
        <View style={{flex:1,gap:1}}><Txt size={14} weight="500">{f?.name??'Fuente desconocida'}</Txt>{f&&f.preparation!=='as_sold'&&<Txt size={10} tone="secondary">{f.preparation==='cooked'?'Peso cocido':'Peso crudo'}</Txt>}</View>
        <Txt size={13} tone="secondary">{fmt(i.grams*portion/r.servings,1)} {f?.basis==='per_100ml'?'ml':'g'}</Txt><Icon name="chevron" size={13}/>
      </Pressable>;
    })}</View><Message>Cantidades para {fmt(portion, 2)} porciones; receta completa: {r.servings} porciones{r.cookedYield ? `, rendimiento ${r.cookedYield} g` : ''}.</Message></> : tab === 'steps' ? <>{r.steps.map((s, i) => <Card key={s.id}><Txt weight="600">Paso {i + 1}</Txt><Txt>{s.text}</Txt>{s.seconds !== null && <Txt size={13} tone="secondary">Temporizador: {duration(s.seconds)}</Txt>}</Card>)}<Button title="Empezar modo cocina" icon="play" onPress={() => nav.go('SC-27', {
        id: r.id
      })} /></> : <><Txt>{comments.length} comentarios disponibles</Txt>{comments.slice(0, 2).map(c => <Card key={c.id}><Txt weight="600">{c.authorName}</Txt><Txt>{c.text}</Txt><Txt size={12} tone="muted">{c.state === 'public' ? 'Publicado' : 'Pendiente de envío'}</Txt></Card>)}<Button title="Abrir comentarios" icon="comment" onPress={() => nav.go('SC-29', {
        id: r.id
      })} /></>}<Button title={aboutOpen?"Ocultar descripción":"Acerca de esta receta"} variant="quiet" onPress={()=>setAboutOpen(!aboutOpen)}/>{aboutOpen&&<Txt tone="secondary">{r.description}</Txt>}<View style={layout.wrap}><RecipeVote recipe={r}/><Button title="Planificar" icon="calendar" variant="quiet" onPress={() => nav.go('SC-41', {
        recipeId: r.id
      })} /></View>{state.accountId !== 'guest' && state.outbox.some(o => o.entityId === r.id) && <Message>Tu interacción está pendiente de sincronización.</Message>}<Button title="Crear mi versión" variant="quiet" onPress={() => nav.go('SC-32', {
      id: r.id
    })} /><Section title="También podría gustarte">{state.recipes.filter(x => x.id !== r.id).slice(0, 2).map(x => <Row key={x.id} title={x.title} subtitle={`${x.minutes} min`} onPress={() => nav.go('SC-26', {
        id: x.id
      })} />)}</Section><Message type="error">{task.error}</Message></Screen>;
}
export function Cooking({
  params
}: ScreenProps) {
  useKeepAwake();
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const r = state.recipes.find(r => r.id === (params.id ?? state.cooking?.recipeId));
  const cooking = state.cooking?.recipeId === r?.id ? state.cooking : null;
  const step = cooking?.step ?? 0;
  if (!r) return <Screen title="Modo cocina"><Empty title="Elegí una receta" detail="Los pasos aparecerán aquí." action="Recetas" onPress={() => nav.replace('SC-24')} /></Screen>;
  const item = r.steps[step];
  return <Screen title="Modo cocina" subtitle={`${r.title} · paso ${step + 1} de ${r.steps.length}`} dock={false} testID="SC-27"><Txt size={28} weight="600">{item?.text}</Txt>{item?.seconds != null && <>{cooking?.deadline ? <Timer deadline={cooking.deadline} label="Tiempo de cocción" /> : <Txt tone="secondary">Tiempo sugerido: {duration(item.seconds)}</Txt>}<Button title={cooking?.deadline ? 'Reiniciar temporizador' : 'Iniciar temporizador'} icon="clock" onPress={() => task.run(() => repo.dispatch({
        type: 'cooking',
        cooking: {
          recipeId: r.id,
          step,
          deadline: Date.now() + item.seconds! * 1000
        }
      }))} />{cooking?.deadline && <Button title="Detener temporizador" variant="quiet" onPress={() => task.run(() => repo.dispatch({
        type: 'cooking',
        cooking: {
          recipeId: r.id,
          step,
          deadline: null
        }
      }))} />}</>}<View style={layout.wrap}><Button title="Paso anterior" disabled={step === 0} variant="secondary" onPress={() => task.run(() => repo.dispatch({
        type: 'cooking',
        cooking: {
          recipeId: r.id,
          step: step - 1,
          deadline: null
        }
      }))} /><Button title={step === r.steps.length - 1 ? 'Terminé de cocinar' : 'Paso siguiente'} onPress={() => task.run(async () => {
        if (step === r.steps.length - 1) {
          await repo.dispatch({
            type: 'cooked',
            recipeId: r.id
          });
          nav.replace('SC-28', {
            id: r.id
          });
        } else await repo.dispatch({
          type: 'cooking',
          cooking: {
            recipeId: r.id,
            step: step + 1,
            deadline: null
          }
        });
      })} /></View><Button title="Guardar y salir" variant="quiet" onPress={() => task.run(async () => {
      await repo.dispatch({
        type: 'cooking',
        cooking: {
          recipeId: r.id,
          step,
          deadline: cooking?.deadline ?? null
        }
      });
      nav.back();
    })} /><Message>Salir conserva el paso y la hora de finalización del temporizador. No se registra comida automáticamente.</Message><Message type="error">{task.error}</Message></Screen>;
}
export function Cooked({
  params
}: ScreenProps) {
  const nav = useNav();
  return <Screen title="Ya está listo" tab="recipes" testID="SC-28"><Empty title="Disfrutá tu comida" detail="Lo que preparaste puede rendir varias porciones. Registrá solo lo que realmente comiste." /><Button title="Registrar cantidad consumida" onPress={() => nav.go('SC-12', {
      recipeId: params.id
    })} /><Button title="Planificar las otras porciones" variant="secondary" onPress={() => nav.go('SC-41', {
      recipeId: params.id
    })} /><Button title="Volver a la receta" variant="quiet" onPress={() => nav.finish('SC-26', {
      id: params.id
    })} /></Screen>;
}
export function Comments({
  params
}: ScreenProps) {
  const {
    state,
    repo,
    identity,
    sync,
    api
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const d = useDraft('comment:' + params.id, () => ({
    id: uid(),
    text: '',
    parentId: null as string | null
  }));
  const comments = state.comments.filter(c => c.recipeId === params.id && c.state !== 'deleted' && !state.blockedIds.includes(c.authorId));
  const send = () => task.run(async () => {
    invariant(identity, 'Iniciá sesión para publicar. El texto queda guardado.');
    invariant(d.value.text.trim().length > 0 && d.value.text.length <= 3000, 'Escribí entre 1 y 3000 caracteres.');
    await repo.dispatch({
      type: 'comment',
      comment: {
        id: d.value.id,
        recipeId: params.id!,
        parentId: d.value.parentId,
        authorId: identity.userId,
        authorName: state.profile.name || 'Usuario',
        text: d.value.text.trim(),
        createdAt: new Date().toISOString(),
        state: 'pending'
      }
    });
    d.set({
      id: uid(),
      text: '',
      parentId: null
    });
    if (api.configured) await sync.sync();
  });
  const refresh = () => task.run(async () => {
    invariant(params.id, 'Falta la receta.');
    await fetchComments(api, repo, params.id);
  });
  return <Screen title="Comentarios" tab="recipes" testID="SC-29">{!comments.length && <Empty title="Todavía no hay comentarios" detail="Compartí cómo te salió o una pregunta sobre la preparación." />}{comments.map(c => <Card key={c.id}><Txt weight="600">{c.authorName}{c.parentId ? ' · respuesta' : ''}</Txt><Txt>{c.text}</Txt><Txt tone="muted" size={12}>{c.state === 'pending' ? 'Pendiente de sincronización' : new Date(c.createdAt).toLocaleDateString('es-AR')}</Txt><View style={layout.wrap}><Button title="Responder" variant="quiet" onPress={() => d.set({
          parentId: c.id
        })} /><Button title="Reportar" variant="quiet" onPress={() => nav.go('SC-72', {
          targetId: c.id,
          authorId: c.authorId,
          type: 'comment'
        })} />{c.authorId === state.accountId && <Button title="Eliminar" variant="quiet" onPress={() => confirm('Eliminar comentario', 'Se enviará la solicitud al sincronizar.', () => task.run(() => repo.dispatch({
          type: 'deleteComment',
          id: c.id
        })), true)} />}</View></Card>)}{d.value.parentId && <Message>Respondiendo a un comentario. <Txt onPress={() => d.set({
        parentId: null
      })}>Cancelar respuesta</Txt></Message>}<Field label="Tu comentario" value={d.value.text} onChangeText={text => d.set({
      text
    })} multiline maxLength={2000} /><Button title="Enviar comentario" busy={task.busy} onPress={send} />{!identity && <Button title="Iniciar sesión sin perder el texto" variant="secondary" onPress={() => nav.go('SC-03')} />}<Button title="Actualizar comentarios" variant="quiet" onPress={refresh} /><Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function Author({
  params
}: ScreenProps) {
  const {
    state,
    repo,
    identity
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const recipes = state.recipes.filter(r => r.authorId === params.authorId);
  const editorial = params.authorId === 'cuki-editorial';
  return <Screen title={recipes[0]?.authorName ?? 'Perfil'} tab="recipes" testID="SC-30"><Message>{editorial ? 'Recetas originales editoriales; la fotografía de ejemplo es generada. No es un profesional de salud ficticio.' : 'Perfil de autor. Los votos de la comunidad no validan datos nutricionales.'}</Message><Button title={state.followedIds.includes(params.authorId ?? '') ? 'Dejar de seguir' : 'Seguir autor'} variant="secondary" onPress={() => identity ? task.run(() => repo.dispatch({
      type: 'toggle',
      field: 'followedIds',
      id: params.authorId!
    })) : nav.go('SC-03')} />{recipes.map(r => <RecipeCard key={r.id} recipe={r} compact onPress={() => nav.go('SC-26', {
      id: r.id
    })} />)}<Button title="Reportar o bloquear" variant="quiet" onPress={() => nav.go('SC-72', {
      authorId: params.authorId,
      targetId: params.authorId,
      type: 'profile'
    })} /><Message type="error">{task.error}</Message></Screen>;
}
export function Collections() {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('saved');
  const collection = state.collections.find(c => c.id === selected);
  const ids = collection?.recipeIds ?? state.savedRecipeIds;
  const recipes = state.recipes.filter(r => ids.includes(r.id));
  return <Screen title="Mis colecciones" tab="recipes" testID="SC-31"><Chips options={[{
      value: 'saved',
      label: 'Guardadas'
    }, ...state.collections.map(c => ({
      value: c.id,
      label: c.name
    }))]} value={selected} onChange={setSelected} />{recipes.map(r => <Row key={r.id} title={r.title} onPress={() => nav.go('SC-26', {
      id: r.id
    })} trailing={collection ? <IconButton name="trash" label={`Quitar ${r.title} de la colección`} onPress={() => task.run(() => repo.dispatch({
      type: 'collection',
      collection: {
        ...collection,
        recipeIds: collection.recipeIds.filter(id => id !== r.id)
      }
    }))} /> : undefined} />)}{!recipes.length && <Empty title="Todavía está vacía" detail="Guardá recetas o añadí alguna a esta colección." />}{collection && <Section title="Añadir guardadas">{state.recipes.filter(r => state.savedRecipeIds.includes(r.id) && !ids.includes(r.id)).map(r => <Row key={r.id} title={r.title} onPress={() => task.run(() => repo.dispatch({
        type: 'collection',
        collection: {
          ...collection,
          recipeIds: [...ids, r.id]
        }
      }))} />)}</Section>}<Field label="Nombre de nueva colección" value={name} onChangeText={setName} /><Button title="Crear colección" busy={task.busy} onPress={() => task.run(async () => {
      invariant(name.trim(), 'Dale un nombre.');
      const id = uid();
      await repo.dispatch({
        type: 'collection',
        collection: {
          id,
          name: name.trim(),
          recipeIds: []
        }
      });
      setName('');
      setSelected(id);
    })} /><Button title="Descubrir recetas" variant="quiet" onPress={() => nav.go('SC-24')} /><Message type="error">{task.error}</Message></Screen>;
}
export function useRecipeDraft(params: ScreenProps['params']) {
  const {
    state
  } = useApp();
  const old = state.recipes.find(r => r.id === params.id);
  const key = editorDraftKey('recipe', params);
  const draft = useDraft<RecipeDraft>(key, () => old ? {
    id: uid(),
    editingId: old.id,
    title: old.title,
    description: old.description,
    servings: String(old.servings),
    yield: old.cookedYield ? String(old.cookedYield) : '',
    minutes: String(old.minutes),
    tags: old.tags.join(', '),
    photoUri: old.photoUri,
    ingredients: old.ingredients.map(i => ({
      ...i,
      id: uid()
    })),
    steps: old.steps.map(s => ({
      ...s,
      id: uid()
    })),
    rights: false
  } : newRecipeDraft());
  return draft;
}
export function RecipeEditor({
  params
}: ScreenProps) {
  const nav = useNav();
  const task = useTask();
  const d = useRecipeDraft(params);
  return <Screen title="Tu receta" tab="recipes" testID="SC-32"><Field label="Título de la receta" value={d.value.title} onChangeText={title => d.set({
      title
    })} /><Field label="Descripción" value={d.value.description} onChangeText={description => d.set({
      description
    })} multiline /><View style={layout.row}><View style={{
        flex: 1
      }}><NumberField label="Porciones totales" value={d.value.servings} onChangeText={servings => d.set({
          servings
        })} /></View><View style={{
        flex: 1
      }}><NumberField label="Minutos" value={d.value.minutes} onChangeText={minutes => d.set({
          minutes
        })} /></View></View><NumberField label="Rendimiento cocido en g, opcional" value={d.value.yield} onChangeText={v => d.set({
      yield: v
    })} /><Field label="Etiquetas separadas por comas" value={d.value.tags} onChangeText={tags => d.set({
      tags
    })} />{d.value.photoUri && <Image source={{
      uri: d.value.photoUri
    }} style={{
      height: 220,
      borderRadius: 22
    }} />}<Button title="Añadir o cambiar foto" variant="secondary" onPress={() => task.run(async () => {
      const uri = await choosePhoto();
      if (uri) d.set({
        photoUri: uri
      });
    })} /><Row title="Ingredientes" subtitle={`${d.value.ingredients.length} ingredientes`} onPress={() => task.run(async () => {
      await d.flush();
      nav.go('SC-33', {
        draftKey: d.key
      });
    })} /><Row title="Preparación" subtitle={`${d.value.steps.length} pasos`} onPress={() => task.run(async () => {
      await d.flush();
      nav.go('SC-34', {
        draftKey: d.key
      });
    })} /><Button title="Previsualizar receta" onPress={() => task.run(async () => {
      await d.flush();
      nav.go('SC-35', {
        draftKey: d.key
      });
    })} /><Message>Tu borrador se guarda en este dispositivo. Volver no lo descarta.</Message><Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function RecipeIngredients({
  params
}: ScreenProps) {
  const {
    state
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const d = useRecipeDraft(params);
  return <Screen title="Ingredientes de la receta" tab="recipes" testID="SC-33">{d.value.ingredients.map(i => <Row key={i.id} title={state.foods.find(f => f.id === i.foodId)?.name ?? 'Fuente no disponible'} subtitle={`${fmt(i.grams, 1)} ${state.foods.find(f => f.id === i.foodId)?.basis === 'per_100ml' ? 'ml' : 'g'}`} onPress={() => nav.go('SC-12', {
      mode: 'recipe',
      draftKey: d.key,
      foodId: i.foodId,
      ingredientId: i.id
    })} trailing={<IconButton name="trash" label="Eliminar ingrediente" onPress={() => d.set({
      ingredients: d.value.ingredients.filter(x => x.id !== i.id)
    })} />} />)}<Button title="Añadir ingrediente" icon="plus" onPress={() => task.run(async () => {
      await d.flush();
      nav.go('SC-10', {
        mode: 'recipe',
        draftKey: d.key
      });
    })} /><Message>Indicá el estado correcto, crudo o cocido, en cada alimento. No se convierte peso crudo a cocido sin un rendimiento conocido.</Message><Button title="Listo, volver a mi receta" variant="secondary" onPress={() => task.run(async () => {
      await d.flush();
      nav.finish('SC-32', {
        draftKey: d.key
      });
    })} /><Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function RecipeSteps({
  params
}: ScreenProps) {
  const nav = useNav();
  const task = useTask();
  const d = useRecipeDraft(params);
  const setStep = (id: string, patch: Partial<RecipeStep>) => d.set({
    steps: d.value.steps.map(s => s.id === id ? {
      ...s,
      ...patch
    } : s)
  });
  const move = (index: number, direction: number) => {
    const steps = [...d.value.steps];
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]];
    d.set({
      steps
    });
  };
  return <Screen title="Preparación paso a paso" tab="recipes" testID="SC-34">{d.value.steps.map((s, i) => <Card key={s.id}><Field label={`Paso ${i + 1}`} value={s.text} onChangeText={text => setStep(s.id, {
        text
      })} multiline /><NumberField label={`Temporizador del paso ${i + 1}, segundos`} hint="Opcional. Vacío significa sin temporizador." value={s.seconds === null ? '' : String(s.seconds)} onChangeText={v => {
        if (!v.trim() || /^\d+$/.test(v)) setStep(s.id, {
          seconds: v ? Number(v) : null
        });
      }} /><View style={layout.wrap}><Button title="Subir" variant="quiet" disabled={i === 0} onPress={() => move(i, -1)} /><Button title="Bajar" variant="quiet" disabled={i === d.value.steps.length - 1} onPress={() => move(i, 1)} /><IconButton name="trash" label={`Eliminar paso ${i + 1}`} onPress={() => d.set({
          steps: d.value.steps.filter(x => x.id !== s.id)
        })} /></View></Card>)}<Button title="Añadir paso" icon="plus" onPress={() => d.set({
      steps: [...d.value.steps, {
        id: uid(),
        text: '',
        seconds: null
      }]
    })} /><Button title="Guardar pasos y volver" variant="secondary" onPress={() => task.run(async () => {
      await d.flush();
      nav.finish('SC-32', {
        draftKey: d.key
      });
    })} /><Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function RecipePreview({
  params
}: ScreenProps) {
  const {
    state,
    repo,
    identity,
    sync,
    api,
    cloud
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const d = useRecipeDraft(params);
  const [saved, setSaved] = useState(false);
  let recipe: Recipe | null = null;
  let validation = '';
  try {
    recipe = {
      id: d.value.id,
      version: (state.recipes.find(r => r.id === d.value.editingId)?.version ?? 0) + 1,
      title: d.value.title.trim(),
      description: d.value.description,
      servings: numberInput(d.value.servings, {
        min: .01
      })!,
      cookedYield: numberInput(d.value.yield, {
        min: .1,
        nullable: true
      }),
      minutes: numberInput(d.value.minutes, {
        min: 1,
        max: 1440
      })!,
      tags: d.value.tags.split(',').map(s => s.trim()).filter(Boolean),
      photoUri: d.value.photoUri,
      assetKey: null,
      ingredients: d.value.ingredients,
      steps: d.value.steps,
      authorId: state.accountId,
      authorName: state.profile.name || 'Vos',
      visibility: 'private',
      createdAt: new Date().toISOString(),
      ...(d.value.editingId ? {
        previousVersionId: d.value.editingId
      } : {})
    };
    invariant(recipe.title.length >= 3, 'El título debe tener al menos tres caracteres.');
    invariant(recipe.ingredients.length && recipe.steps.length, 'Agregá ingredientes y pasos.');
    invariant(recipe.steps.every(s => s.text.trim()), 'Todos los pasos necesitan texto.');
  } catch (e) {
    validation = (e as Error).message;
  }
  const save = (publish: boolean) => task.run(async () => {
    invariant(recipe && !validation, validation || 'Revisá el borrador.');
    if (publish) {
      invariant(identity, 'Iniciá sesión para publicar; tu borrador se conserva.');
      invariant(d.value.rights, 'Confirmá que tenés derechos para compartir la receta y su fotografía.');
      invariant(api.configured, 'Falta configurar el servidor. Podés guardar la receta privada.');
    }
    const assetIds = publish && recipe!.photoUri ? [await cloud.uploadPhoto(recipe!.photoUri!, 'recipe_photo')] : [];
    const value = {
      ...recipe!,
      assetIds,
      visibility: (publish ? 'pending' : 'private') as Recipe['visibility']
    };
    await repo.dispatchMany([{
      type: 'recipe',
      recipe: value
    }, {
      type: 'dropDraft',
      key: d.key
    }]);
    setSaved(true);
    nav.replace('SC-26', {
      id: value.id
    });
    if (publish) void sync.sync().catch(() => {});
  });
  return <Screen title="Previsualizar receta" tab="recipes" testID="SC-35">{recipe && <><RecipeMedia recipe={recipe} /><Title>{recipe.title || 'Sin título'}</Title><Txt>{recipe.description}</Txt>{recipe.ingredients.length > 0 && <MacroRow nutrients={recipeNutrition(recipe, state.foods)} />}<Txt tone="secondary">Por porción · {recipe.servings} porciones en total</Txt>{recipe.steps.map((s, i) => <Row key={s.id} title={`${i + 1}. ${s.text}`} />)}</>}<Message type="error">{validation || task.error || d.error}</Message><Toggle label="Puedo compartir la receta y sus imágenes" value={d.value.rights} onChange={rights => d.set({
      rights
    })} /><Button title="Guardar privada" busy={task.busy} disabled={!!validation || saved} onPress={() => save(false)} /><Button title="Enviar receta a revisión pública" variant="secondary" busy={task.busy} disabled={!!validation || saved || !d.value.rights} onPress={() => save(true)} /><CloudNotice /><Button title="Volver a editar" variant="quiet" onPress={() => nav.finish('SC-32', {
      draftKey: d.key
    })} /></Screen>;
}
export const recipeScreens = {
  'SC-23': RecipesHome,
  'SC-24': RecipeSearch,
  'SC-25': RecipeFilterScreen,
  'SC-26': RecipeDetail,
  'SC-27': Cooking,
  'SC-28': Cooked,
  'SC-29': Comments,
  'SC-30': Author,
  'SC-31': Collections,
  'SC-32': RecipeEditor,
  'SC-33': RecipeIngredients,
  'SC-34': RecipeSteps,
  'SC-35': RecipePreview
};