import React,{useEffect,useRef} from 'react';
import {Pressable,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import type {Recipe} from '../../../../packages/core/types';
import {fmt,invariant} from '../../../../packages/core/utils';
import {useApp,useTask} from '../data/AppProvider';
import {Glass,Txt,Message,useNav} from './components';
import {Icon} from './Icon';
import {useTheme} from './theme';

/** Local intent is immediate and durable. The aggregate is always the last
 * confirmed server value: a pending tap is never fabricated as another vote. */
export function RecipeVote({recipe}:{recipe:Recipe}) {
  const {state,repo,identity,api}=useApp(),{c}=useTheme(),task=useTask(),nav=useNav();
  const readable=recipe.visibility==='editorial'||recipe.visibility==='public';
  const selected=state.votedRecipeIds.includes(recipe.id);
  const operations=state.outbox.filter(o=>o.entityType==='votedRecipeIds'&&o.entityId===recipe.id);
  const unsettled=operations.length>0;
  const rejected=operations.some(o=>o.state==='failed'||o.state==='conflict');
  const aggregate=useQuery({
    queryKey:['recipe-vote-total',state.accountId,recipe.id],
    enabled:api.configured&&readable,staleTime:30000,retry:false,
    queryFn:async({signal})=>{
      const result=await api.request<Recipe>('/v1/recipes/'+encodeURIComponent(recipe.id),'GET',undefined,undefined,signal);
      invariant(result.id===recipe.id&&Number.isSafeInteger(result.upvotes)&&result.upvotes!>=0,'El recuento de votos no se pudo confirmar.');
      return result.upvotes!;
    }
  });
  const prior=useRef({account:state.accountId,recipe:recipe.id,unsettled});
  useEffect(()=>{
    const old=prior.current;
    if(old.account===state.accountId&&old.recipe===recipe.id&&old.unsettled&&!unsettled&&api.configured&&readable)
      void aggregate.refetch();
    prior.current={account:state.accountId,recipe:recipe.id,unsettled};
  },[state.accountId,recipe.id,unsettled,api.configured,readable,aggregate.refetch]);
  if(!readable)return null;
  const known=aggregate.data??recipe.upvotes;
  const count=Number.isSafeInteger(known)&&known!>=0?known:null;
  const status=rejected?'El voto necesita revisión; el total aún no está actualizado.':unsettled?'Cambio guardado, pendiente de sincronización.':aggregate.isError?'No se pudo actualizar el total.':null;
  const intent=selected?'Retirar voto':'Votar receta';
  return <View style={{gap:3}}>
    <Pressable testID={'recipe-vote-'+recipe.id} accessibilityRole="button"
      accessibilityLabel={`${intent} ${recipe.title}${count===null?'':`, ${fmt(count)} votos confirmados`}`}
      accessibilityHint={status??'El voto ayuda a descubrir recetas; no verifica sus nutrientes.'}
      accessibilityState={{selected,disabled:task.busy,busy:task.busy}}
      disabled={task.busy} onPress={()=>{
        if(!identity?.verified){nav.go('SC-03');return;}
        void task.run(()=>repo.dispatch({type:'toggle',field:'votedRecipeIds',id:recipe.id}));
      }}>
      <Glass strong style={{borderRadius:999,paddingHorizontal:12,minHeight:48,justifyContent:'center'}}>
        <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
          <Icon name="up" size={18} color={selected?c.protein:c.text}/>
          <Txt size={13} tone={selected?'protein':'text'} weight="600">{count===null?'Votar':fmt(count)}</Txt>
          {unsettled&&<Icon name={rejected?'warning':'clock'} size={12} color={rejected?c.warning:c.secondary}/>}
        </View>
      </Glass>
    </Pressable>
    <Message type="error">{task.error}</Message>
  </View>;
}
