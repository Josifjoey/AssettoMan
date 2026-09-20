import { useEffect, useState } from 'react';
import { api } from './api';

export interface SystemHealth {
  docker: boolean;
  dataDir: string;
  hostDataDir: string;
  hostMapping: boolean;
}

export function useSystemHealth() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  useEffect(() => {
    api.get('/system/health').then((r) => setHealth(r.data)).catch(() => setHealth(null));
  }, []);
  return health;
}
