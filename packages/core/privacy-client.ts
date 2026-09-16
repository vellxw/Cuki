import type {ApiClient} from './api';
import type {ClientRepo} from './repository';
import {invariant, stableJSON} from './utils';
export async function requestPrivacyOperation(api: ApiClient, repo: ClientRepo, kind: 'export' | 'delete') {
  invariant(repo.accountId !== 'guest', 'Iniciá sesión para pedir los datos del servidor.');
  const scope = 'privacy:' + kind;
  const body = kind === 'delete' ? {confirmation: 'ELIMINAR'} : {};
  const key = await repo.requestKey(scope, body);
  const result = await api.request<{id: string; state: string}>(
    kind === 'delete' ? '/v1/privacy/account' : '/v1/privacy/export',
    kind === 'delete' ? 'DELETE' : 'POST', body, key);
  invariant(typeof result.id === 'string' && (result.state === 'queued' || result.state === 'completed' || result.state === 'running'), 'El servidor no confirmó la solicitud.');
  // A lost response keeps the durable key for a safe retry. After acknowledged export,
  // the user may deliberately request a fresh snapshot; deletion stays idempotent forever.
  if (kind === 'export') await repo.mutate(state => { delete state.requestKeys[scope + ':' + stableJSON(body)]; });
  return result;
}
