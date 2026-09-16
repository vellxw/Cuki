import type {SetEntry} from './types';
/** Sync acknowledgement may change a transport revision without changing any editable
 * data. Only an unchanged, explicitly captured baseline can be safely rebased. */
const fields=(s:SetEntry)=>[s.id,s.kind,s.loadMode,s.load,s.reps,s.seconds,s.meters,s.rir,s.note,s.completedAt];
export function sameSetContents(a:SetEntry,b:SetEntry){return JSON.stringify(fields(a))===JSON.stringify(fields(b));}
export function acceptsSetRevision(current:SetEntry,submitted:SetEntry,baseline?:SetEntry){
  if(current.version===submitted.version)return true;
  return !!baseline&&baseline.id===submitted.id&&baseline.version===submitted.version&&sameSetContents(current,baseline);
}
