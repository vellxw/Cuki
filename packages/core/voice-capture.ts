/** Microphone lifecycle only. No server, entitlement, or nutrition mutation is allowed
 * here. The user explicitly sends the resulting local recording for review later. */
export interface VoicePort {
  prepare(): Promise<void>;
  begin(maxSeconds: number): void;
  finish(): Promise<string | null>;
  save(uri: string): Promise<void>;
  abandon(uri: string): Promise<void>;
}
export interface VoiceState { phase: 'idle'|'preparing'|'recording'|'stopping'|'review'|'error'; error: string|null }
export class VoiceCaptureSession {
  private state: VoiceState = { phase:'idle', error:null };
  private listeners = new Set<()=>void>();
  private preparing: Promise<void>|null = null;
  private stopping: Promise<void>|null = null;
  private requested = false;
  private disposed = false;
  private deadline: ReturnType<typeof setTimeout>|null = null;
  constructor(private port: VoicePort) {}
  getSnapshot = () => this.state;
  subscribe = (fn:()=>void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private update(phase:VoiceState['phase'],error:string|null=null) { this.state={phase,error};this.listeners.forEach(fn=>fn()); }
  private clear() { if(this.deadline!==null)clearTimeout(this.deadline);this.deadline=null; }
  start = (): Promise<void> => {
    if(this.disposed || this.preparing || this.stopping || this.state.phase==='recording')return Promise.resolve();
    this.requested=true;this.update('preparing');
    const pending=(async()=>{
      let prepared=false;
      try {
        await this.port.prepare();prepared=true;
        if(!this.requested||this.disposed){const uri=await this.port.finish();if(uri)await this.port.abandon(uri);this.update('idle');return;}
        this.port.begin(120);this.update('recording');
        this.deadline=setTimeout(()=>{void this.stop();},120000);
      }catch(error){this.requested=false;if(prepared){try{const uri=await this.port.finish();if(uri)await this.port.abandon(uri);}catch{}}this.update('error',error instanceof Error?error.message:'No se pudo iniciar el micrófono.');}
    })();
    this.preparing=pending;void pending.finally(()=>{if(this.preparing===pending)this.preparing=null;});return pending;
  };
  stop = (): Promise<void> => {
    this.requested=false;this.clear();
    if(this.stopping)return this.stopping;
    if(this.preparing)return this.preparing.then(()=>{});
    if(this.state.phase!=='recording')return Promise.resolve();
    this.update('stopping');
    const pending=(async()=>{
      try { const uri=await this.port.finish();if(!uri)throw new Error('No se guardó audio. Podés escribir la comida.');await this.port.save(uri);this.update('review'); }
      catch(error){this.update('error',error instanceof Error?error.message:'No se pudo guardar el audio.');}
    })();
    this.stopping=pending;void pending.finally(()=>{if(this.stopping===pending)this.stopping=null;});return pending;
  };
  dispose = () => {this.disposed=true;void this.stop();this.listeners.clear();};
}
