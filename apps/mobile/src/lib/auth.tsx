import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, MeResponse } from '@motix/shared';
import { api, session } from './api';

interface AuthState {
  user: MeResponse | null;
  loading: boolean;
  signIn: (r: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setUser((await session.get()) ? await api<MeResponse>('GET', '/me') : null);
    } catch {
      await session.set(null);
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
      signIn: async (r) => {
        await session.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
        setUser(r.user);
      },
      signOut: async () => {
        const s = await session.get();
        if (s) await api('POST', '/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
        await session.set(null);
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
