import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,createSession,reduceCommand} from '../../packages/core/state';
import {uid,localDate} from '../../packages/core/utils';
import {nextWorkout,scheduledWorkouts,validateWorkoutSchedule,addCivilDays,civilWeekday,scheduleLabel} from '../../packages/core/workout-calendar';
import {entitySchemas,workoutScheduleSchema} from '../../packages/contracts/entities';
import type {WorkoutPlan,WorkoutSession} from '../../packages/core/types';
const now='2026-09-14T12:00:00.000Z';
function setup(){
 const state=initialState('guest','America/Argentina/Buenos_Aires',now);
 const plan:WorkoutPlan={id:uid(),version:1,name:'Rutina real',weeks:8,deload:false,createdAt:now,
  days:['Upper A','Lower A'].map(name=>({id:uid(),name,exercises:[{id:uid(),exerciseId:state.exercises[0].id,sets:3,repsMin:8,repsMax:12,load:20,restSeconds:90,superset:null}]}))};
 return{state,plan};
}
function finished(state:ReturnType<typeof initialState>,plan:WorkoutPlan,dayIndex:number,date='2026-09-14'):WorkoutSession{
 const s=createSession(state,plan,dayIndex,undefined,date+'T12:00:00.000Z');s.status='completed';s.endedAt=date+'T13:00:00.000Z';return s;
}
test('a saved schedule is optional; local and server validators reject the same malformed schedules',()=>{
 validateWorkoutSchedule(undefined);
 for(const value of [null,{},[],{weekdays:[],time:null},{weekdays:[0],time:null},{weekdays:[8],time:null},{weekdays:[1,1],time:null},
  {weekdays:[1.2],time:null},{weekdays:['1'],time:null},{weekdays:[1],time:'24:00'},{weekdays:[1],time:'7:15'},
  {weekdays:[1],time:'19:60'},{weekdays:[1],time:''},{weekdays:[1],time:'19:'}]){
  assert.throws(()=>validateWorkoutSchedule(value));assert.equal(workoutScheduleSchema.safeParse(value).success,false);
 }
 for(const value of [{weekdays:[1],time:null},{weekdays:[7,1],time:'00:00'},{weekdays:[1,2,3,4,5,6,7],time:'23:59'}]){
  validateWorkoutSchedule(value);assert.equal(workoutScheduleSchema.safeParse(value).success,true);
 }
});
test('next action selects the earliest real schedule, not the first plan or an invented hour',()=>{
 const {state,plan}=setup();plan.days[0].schedule={weekdays:[2],time:'19:30'};plan.days[1].schedule={weekdays:[1],time:'18:00'};
 const copy=structuredClone({plan,state});const result=nextWorkout([plan],state.sessions,'2026-09-14')!;
 assert.equal(result.day.id,plan.days[1].id);assert.equal(result.dayIndex,1);assert.equal(result.date,'2026-09-14');assert.equal(result.time,'18:00');
 assert.deepEqual({plan,state},copy);assert.equal(state.sessions.length,0);assert.equal(state.diary.length,0);assert.equal(state.garden,null);
});
test('two days at the same time remain visible and preserve user order',()=>{
 const {plan}=setup();for(const d of plan.days)d.schedule={weekdays:[1],time:'19:30'};
 assert.deepEqual(scheduledWorkouts([plan],[],'2026-09-14').map(w=>w.day.id),plan.days.map(d=>d.id));
 plan.days[0].schedule!.time=null;
 assert.equal(nextWorkout([plan],[],'2026-09-14')!.dayIndex,1);
});
test('a completed occurrence advances the weekly suggestion without altering credits or history',()=>{
 const {state,plan}=setup();plan.days=[plan.days[0]];plan.days[0].schedule={weekdays:[1],time:'19:30'};
 const session=finished(state,plan,0);const before=structuredClone(session);
 const next=nextWorkout([plan],[session],'2026-09-14')!;
 assert.equal(next.date,'2026-09-21');assert.deepEqual(session,before);
 session.status='discarded';assert.equal(nextWorkout([plan],[session],'2026-09-14')!.date,'2026-09-14');
});
test('stable day IDs distinguish equal titles and legacy sessions never guess a plan day',()=>{
 const {state,plan}=setup();plan.days[1].name=plan.days[0].name;for(const d of plan.days)d.schedule={weekdays:[1],time:null};
 const s=finished(state,plan,0);
 assert.equal(nextWorkout([plan],[s],'2026-09-14')!.day.id,plan.days[1].id);
 delete s.planDayId;assert.equal(nextWorkout([plan],[s],'2026-09-14')!.day.id,plan.days[0].id);
});
test('flexible routines follow the last recorded day, ignoring discarded and future sessions',()=>{
 const {state,plan}=setup();const done=finished(state,plan,0),future=finished(state,plan,1,'2026-09-20');
 const candidate=nextWorkout([plan],[done,future],'2026-09-14')!;
 assert.equal(candidate.dayIndex,1);assert.equal(candidate.date,null);assert.equal(candidate.time,null);
 assert.equal(candidate.reason,'flexible');
 done.status='discarded';assert.equal(nextWorkout([plan],[done],'2026-09-14')!.dayIndex,0);
 assert.equal(nextWorkout([],[],'2026-09-14'),null);
});
test('civil dates stay correct across DST, leap days, years and profile timezones',()=>{
 assert.equal(civilWeekday('2026-09-14'),1);assert.equal(civilWeekday('2026-09-20'),7);
 assert.equal(addCivilDays('2028-02-28',1),'2028-02-29');assert.equal(addCivilDays('2026-12-31',1),'2027-01-01');
 assert.equal(addCivilDays('2026-03-08',1),'2026-03-09');
 const at=new Date('2026-09-15T00:30:00Z');assert.equal(localDate(at,'America/Argentina/Buenos_Aires'),'2026-09-14');
 assert.equal(localDate(at,'Asia/Tokyo'),'2026-09-15');
 assert.throws(()=>nextWorkout([],[],'2026-02-30'));
});
test('new sessions preserve plan-day identity while legacy payloads remain valid',()=>{
 const {state,plan}=setup();const raw=createSession(state,plan,1,undefined,now);
 assert.equal(raw.planDayId,plan.days[1].id);assert.equal(raw.name,'Lower A');
 const valid={...raw,version:1};assert.equal(entitySchemas.session.safeParse(valid).success,true);
 delete valid.planDayId;assert.equal(entitySchemas.session.safeParse(valid).success,true);
});
test('offline plan validation rejects invalid time before changing storage and retains old unscheduled plans',()=>{
 const {state,plan}=setup();plan.days[0].schedule={weekdays:[1],time:'19:'};
 assert.throws(()=>reduceCommand(state,{type:'plan',plan},now),/hora/);assert.equal(state.plans.length,0);
 delete plan.days[0].schedule;const next=reduceCommand(state,{type:'plan',plan},now);
 assert.equal(entitySchemas.plan.safeParse(next.plans[0]).success,true);
 assert.equal(scheduleLabel(undefined),'Días flexibles · sin hora fija');
 assert.equal(scheduleLabel({weekdays:[5,1,3],time:'19:30'}),'Lun · Mié · Vie · 19:30');
});
