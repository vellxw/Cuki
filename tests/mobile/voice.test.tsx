import {jest,beforeEach,test,expect} from '@jest/globals';
import React from 'react';
import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import * as audio from 'expo-audio';
import {VoiceCapture} from '../../apps/mobile/src/ui/VoiceCapture';
import {initialState} from '../../packages/core/state';
jest.mock('../../apps/mobile/src/data/AppProvider',()=>({useApp:()=>({state:mockState,api:{configured:false},identity:null})}));
const mockState=initialState('guest','UTC','2026-09-15T12:00:00Z');
let recording=false;
const recorder={uri:'file:///own/voice.m4a',record:jest.fn(()=>{recording=true}),stop:jest.fn(async()=>{recording=false}),getStatus:()=>({isRecording:recording,canRecord:true}),prepareToRecordAsync:jest.fn(async()=>{})};
beforeEach(()=>{recording=false;(audio.useAudioRecorder as jest.Mock).mockReturnValue(recorder);(audio.requestRecordingPermissionsAsync as jest.Mock<any>).mockResolvedValue({granted:false});});
test('mounting the voice panel does not request permission or transmit an existing private recording',()=>{
 const send=jest.fn();render(<VoiceCapture uri="file:///own/voice.m4a" onRecorded={async()=>{}} onDiscard={async()=>{}} onSend={send}/>);
 expect(audio.requestRecordingPermissionsAsync).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
 fireEvent.press(screen.getByRole('button',{name:'Analizar audio'}));expect(send).toHaveBeenCalledTimes(1);
});
test('denied microphone shows recovery copy without opening a recorder',async()=>{
 render(<VoiceCapture uri={null} onRecorded={async()=>{}} onDiscard={async()=>{}} onSend={()=>{}}/>);
 fireEvent.press(screen.getByRole('button',{name:'Grabar hasta 2 minutos'}));
 await waitFor(()=>expect(screen.getByText(/micrófono no fue autorizado/)).toBeTruthy());expect(recorder.record).not.toHaveBeenCalled();
});
test('native adapter stores the recording URI after stopping and never submits nutrition by itself',async()=>{
 (audio.requestRecordingPermissionsAsync as jest.Mock<any>).mockResolvedValue({granted:true});const save=jest.fn(async(uri:string)=>{}),send=jest.fn();
 render(<VoiceCapture uri={null} onRecorded={save} onDiscard={async()=>{}} onSend={send}/>);
 fireEvent.press(screen.getByRole('button',{name:'Grabar hasta 2 minutos'}));await waitFor(()=>expect(recorder.record).toHaveBeenCalledWith({forDuration:120}));
 fireEvent.press(screen.getByRole('button',{name:'Detener grabación'}));await waitFor(()=>expect(save).toHaveBeenCalledWith('file:///own/voice.m4a'));
 expect(recorder.stop).toHaveBeenCalledTimes(1);expect(send).not.toHaveBeenCalled();
 expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith({allowsRecording:false});
});
