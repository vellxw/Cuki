import React,{useCallback,useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {AppState,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {useAudioRecorder,useAudioRecorderState,RecordingPresets,requestRecordingPermissionsAsync,setAudioModeAsync} from 'expo-audio';
import {File,Paths} from 'expo-file-system';
import {VoiceCaptureSession} from '../../../../packages/core/voice-capture';
import {invariant,duration} from '../../../../packages/core/utils';
import {Button,Message,Txt} from './components';

/** Records on explicit press. Leaving the foreground ends recording; no background
 * microphone permission or automatic upload. The document URI is persisted by caller. */
export function VoiceCapture({uri,onRecorded,onDiscard,onSend}:{uri:string|null;onRecorded:(uri:string)=>Promise<void>;onDiscard:()=>Promise<void>;onSend:()=>void}) {
  const callbacks=useRef({onRecorded,onDiscard});callbacks.current={onRecorded,onDiscard};
  const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,directory:'document'});
  const meter=useAudioRecorderState(recorder,250);
  const session=useMemo(()=>new VoiceCaptureSession({
    async prepare(){
      const permission=await requestRecordingPermissionsAsync();
      invariant(permission.granted,'El micrófono no fue autorizado. Podés continuar escribiendo.');
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,allowsBackgroundRecording:false});
      try { await recorder.prepareToRecordAsync(); }
      catch(error){await setAudioModeAsync({allowsRecording:false});throw error;}
    },
    begin:max=>recorder.record({forDuration:max}),
    async finish(){
      try { if(recorder.getStatus().isRecording||recorder.getStatus().canRecord)await recorder.stop();return recorder.uri; }
      finally { await setAudioModeAsync({allowsRecording:false}); }
    },
    save:value=>callbacks.current.onRecorded(value),
    async abandon(value){if(value.startsWith(Paths.document.uri)){const file=new File(value);if(file.exists)file.delete();}},
  }),[recorder]);
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
  useEffect(()=>()=>session.dispose(),[session]);
  useFocusEffect(useCallback(()=>()=>{void session.stop();},[session]));
  useEffect(()=>{const sub=AppState.addEventListener('change',value=>{if(value!=='active')void session.stop();});return()=>sub.remove();},[session]);
  const busy=state.phase==='preparing'||state.phase==='stopping',recording=state.phase==='recording';
  return <View style={{gap:16}} testID="voice-capture">
    <Txt size={24} weight="600">Contalo con tu voz</Txt>
    <Message>El audio se guarda en este dispositivo. Solo se envía cuando tocás Analizar audio. Después revisás ingredientes y cantidades.</Message>
    {(recording||busy)?<><Txt size={44} weight="500">{duration(meter.durationMillis/1000)}</Txt><Button title={busy?'Preparando audio…':'Detener grabación'} icon="microphone" busy={busy} onPress={()=>session.stop()}/></>:uri?<><Message type="success">Audio guardado. Podés enviarlo para obtener una estimación editable.</Message><Button title="Analizar audio" icon="microphone" onPress={onSend}/><Button title="Descartar audio" variant="quiet" onPress={()=>callbacks.current.onDiscard()}/></>:<Button title="Grabar hasta 2 minutos" icon="microphone" onPress={()=>session.start()}/>}
    <Message type="error">{state.error}</Message>
  </View>;
}
