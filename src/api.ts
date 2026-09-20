import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

export type Role = 'admin' | 'manager';
export interface User { id: string; username: string; role: Role; display_name?: string; is_active?: number; last_login?: string }

export interface ServerLive {
  state: string;
  running: boolean;
  players?: number | null;
  maxPlayers?: number | null;
  track?: string | null;
  serverName?: string;
  apiReachable?: boolean;
  note?: string;
  startedAt?: string;
}

export interface GameServer {
  id: string;
  name: string;
  type: 'ac' | 'ac_modded' | 'assettoserver' | 'acc';
  runtime?: 'docker' | 'local';
  container_name?: string;
  container_id?: string;
  exePath?: string;
  exePresent?: boolean;
  ports: { game: number; http?: number; plugin?: number; pluginListen?: number };
  config: any;
  data_dir: string;
  is_public: boolean;
  public_blurb?: string;
  status: string;
  live?: ServerLive;
  installed?: { cars: string[]; tracks: string[] };
  accExePresent?: boolean;
}

export interface ContentItem {
  id: string;
  server_id?: string;
  kind: 'car' | 'track' | 'mod';
  name: string;
  version?: string;
  filename?: string;
  size?: number;
  enabled: number;
  is_public_download: number;
  source_type?: 'hosted' | 'external';
  external_url?: string;
  content_id?: string;
  description?: string;
  preview_image?: string;
  created_at: string;
}

export interface LinkPreview {
  title?: string | null;
  image?: string | null;
  description?: string | null;
  siteName?: string | null;
  url: string;
  kind?: 'car' | 'track';
}

export interface CmContent {
  cars: Record<string, { url: string; version?: string }>;
  track?: { url: string; version?: string };
  missing: string[];
}

export const contentApi = {
  preview: (url: string) => api.get<LinkPreview>('/content/preview', { params: { url } }),
  link: (body: any) => api.post('/content/link', body),
  cmContent: (serverId: string) => api.get<CmContent>(`/servers/${serverId}/cm-content`),
};
