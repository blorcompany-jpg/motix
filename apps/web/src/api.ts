import type { ApiError, AuthResponse } from '@motix/shared';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
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

export const session = {
  get(): Session | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      return null;
    }
  },
  set(s: Session | null) {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  },
};

async function raw(method: string, path: string, body?: unknown, token?: string) {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, 'network', 'Server non raggiungibile: controlla la connessione e riprova');
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
  const current = session.get();
  if (!current) return null;
  refreshing ??= raw('POST', '/auth/refresh', { refreshToken: current.refreshToken })
    .then((r: AuthResponse) => {
      const next = { accessToken: r.accessToken, refreshToken: r.refreshToken };
      session.set(next);
      return next;
    })
    .catch(() => {
      session.set(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Chiamata all'API; se il token è scaduto lo rinnova e riprova una volta. */
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const s = session.get();
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

/** Scarica un file protetto (es. il report in CSV) e lo salva con il nome indicato. */
export async function download(path: string, filename: string) {
  const s = session.get();
  const res = await fetch(BASE + path, { headers: s ? { authorization: `Bearer ${s.accessToken}` } : {} });
  if (!res.ok) throw new ApiFailure(res.status, 'download', 'Download non riuscito: riprova');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
