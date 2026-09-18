import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, User } from './api';

interface AuthCtx {
  user: User | null;
  setupRequired: boolean | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  setup: (u: string, p: string, d?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/auth/status');
        setSetupRequired(data.setupRequired);
        if (!data.setupRequired) {
          const me = await api.get('/auth/me').then((r) => r.data.user).catch(() => null);
          setUser(me);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    setUser(data.user);
  };

  const setup = async (username: string, password: string, displayName?: string) => {
    const { data } = await api.post('/auth/setup', { username, password, displayName });
    setUser(data.user);
    setSetupRequired(false);
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  return <Ctx.Provider value={{ user, setupRequired, loading, login, setup, logout }}>{children}</Ctx.Provider>;
}
