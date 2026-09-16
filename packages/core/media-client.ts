import type { ApiClient } from './api';
import type { AIJob, AIRoute } from './types';
import { invariant } from './utils';

export const mediaPurposes = ['recipe', 'food', 'photo', 'label', 'voice', 'scan', 'avatar'] as const;
export type MediaPurpose = typeof mediaPurposes[number];
export interface OwnedMedia { exists: boolean; size: number; arrayBuffer(): Promise<ArrayBuffer> }

/** The server and capture client use the same purpose vocabulary. Photos have already
 * been normalized to JPEG; native HIGH_QUALITY voice recordings use MP4/AAC. */
export function capturePurpose(route: AIRoute): MediaPurpose {
  invariant(route === 'photo' || route === 'label' || route === 'voice', 'Esta tarea no admite archivos.');
  return route;
}
export async function uploadOwnedMedia(api: ApiClient, file: OwnedMedia, purpose: string, http: typeof fetch = fetch): Promise<string> {
  invariant((mediaPurposes as readonly string[]).includes(purpose), 'El destino del archivo no es válido.');
  invariant(file.exists, 'El archivo ya no está disponible en este dispositivo.');
  invariant(Number.isSafeInteger(file.size) && file.size > 0 && file.size <= 12_000_000, 'El archivo debe tener entre 1 byte y 12 MB.');
  const data = await file.arrayBuffer();
  invariant(data.byteLength === file.size, 'El archivo cambió mientras se preparaba la carga. Reintentá.');
  const signed = await api.request<{ id: string; url: string; headers: Record<string, string> }>('/v1/media/upload', 'POST', {
    purpose, mime: purpose === 'voice' ? 'audio/mp4' : 'image/jpeg', bytes: data.byteLength,
  });
  invariant(typeof signed.id === 'string' && /^[0-9a-f-]{36}$/i.test(signed.id), 'La carga no recibió un identificador válido.');
  invariant(typeof signed.url === 'string' && /^https?:\/\//.test(signed.url), 'El servidor no devolvió una URL de carga válida.');
  const response = await http(signed.url, {
    method: 'PUT', headers: signed.headers, body: data, signal: AbortSignal.timeout(40000),
  });
  invariant(response.ok, 'No se pudo subir el archivo. Reintentá.');
  const confirmed = await api.request<{ id: string; ready: boolean }>('/v1/media/' + signed.id + '/complete', 'POST', {});
  invariant(confirmed.id === signed.id && confirmed.ready === true, 'El servidor todavía no confirmó la carga.');
  return signed.id;
}

/** A finished worker's immutable estimate must never overwrite the user's later review
 * or reopen an already registered meal. Corrections are private, durable local data. */
export function reconcileJob(remote: AIJob, local?: AIJob): AIJob {
  invariant(!local || remote.id === local.id, 'La respuesta pertenece a otra tarea.');
  if (!local) return remote;
  if (local.state === 'applied' || local.state === 'cancelled') return local;
  if (local.state === 'review') return { ...local, mediaUri: local.mediaUri ?? remote.mediaUri };
  return { ...remote, mediaUri: local.mediaUri ?? remote.mediaUri };
}
