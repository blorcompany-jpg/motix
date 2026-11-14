import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, MeResponse } from '@motix/shared';
import { api, session } from './api';

interface AuthState {
  user: MeResponse | null;
  loading: boolean;
  signIn: (r: AuthResponse) => void;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(session.get()));

  const reload = useCallback(async () => {
    if (!session.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<MeResponse>('GET', '/me'));
    } catch {
      session.set(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      reload,
      signIn: (r) => {
        session.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
        setUser(r.user);
      },
      signOut: async () => {
        const s = session.get();
        if (s) await api('POST', '/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
        session.set(null);
        setUser(null);
      },
    }),
    [user, loading, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider mancante');
  return v;
}
