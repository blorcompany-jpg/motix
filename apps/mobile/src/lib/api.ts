import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ApiError, AuthResponse } from '@motix/shared';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const KEY = 'motix.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** I token restano nel portachiavi del telefono; sul web nel browser. */
const store = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return SecureStore.getItemAsync(KEY);
  },
  async set(value: string | null) {
    if (Platform.OS === 'web') {
      if (value) globalThis.localStorage?.setItem(KEY, value);
      else globalThis.localStorage?.removeItem(KEY);
      return;
    }
    if (value) await SecureStore.setItemAsync(KEY, value);
    else await SecureStore.deleteItemAsync(KEY);
  },
};

let current: Session | null | undefined;

export const session = {
  async get(): Promise<Session | null> {
    if (current === undefined) {
      try {
        current = JSON.parse((await store.get()) ?? 'null');
      } catch {
        current = null;
      }
    }
    return current ?? null;
  },
  async set(s: Session | null) {
    current = s;
    await store.set(s ? JSON.stringify(s) : null);
  },
};

async function raw(method: string, path: string, body?: unknown, token?: string) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, 'network', 'Connessione assente: controlla la rete e riprova');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiFailure(res.status, err?.code ?? 'error', err?.message ?? 'Si è verificato un errore', err?.fields);
  }
  return data;
}

let refreshing: Promise<Session | null> | null = null;

async function refresh(): Promise<Session | null> {
  const s = await session.get();
  if (!s) return null;
  refreshing ??= raw('POST', '/auth/refresh', { refreshToken: s.refreshToken })
    .then(async (r: AuthResponse) => {
      const next = { accessToken: r.accessToken, refreshToken: r.refreshToken };
      await session.set(next);
      return next;
    })
    .catch(async () => {
      await session.set(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Chiamata all'API; se il token è scaduto lo rinnova e riprova una volta. */
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const s = await session.get();
  try {
    return await raw(method, path, body, s?.accessToken);
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 401 && s) {
      const next = await refresh();
      if (next) return raw(method, path, body, next.accessToken);
    }
    throw e;
  }
}

/** Carica una foto o un video scelto dalla galleria e restituisce il riferimento da allegare. */
export async function uploadMedia(asset: { uri: string; mimeType?: string; fileName?: string | null; file?: File }): Promise<{ id: string; url: string; type: 'image' | 'video' }> {
  const form = new FormData();
  if (Platform.OS === 'web') form.append('file', asset.file ?? (await (await fetch(asset.uri)).blob()), asset.fileName ?? 'file');
  else form.append('file', { uri: asset.uri, name: asset.fileName ?? 'file', type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);
  const send = async (token?: string) => fetch(`${BASE}/media`, { method: 'POST', body: form, headers: token ? { authorization: `Bearer ${token}` } : {} });
  let res: Response;
  try {
    res = await send((await session.get())?.accessToken);
    if (res.status === 401) {
      const next = await refresh();
      if (next) res = await send(next.accessToken);
    }
  } catch {
    throw new ApiFailure(0, 'network', 'Caricamento non riuscito: controlla la rete e riprova');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiFailure(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Caricamento non riuscito');
  return data;
}
