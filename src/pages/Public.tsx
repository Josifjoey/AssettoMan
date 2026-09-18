import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Card, Badge } from '../components/ui';
import { Gauge, MapPin, Users, Download, Package, Lock, ExternalLink } from 'lucide-react';

// Community-facing page — no login required. Shows live server status,
// rules and mod downloads.

interface PublicServer {
  id: string; name: string; type: string; game: string; blurb: string;
  running: boolean; track?: string; players?: number | null; maxPlayers?: number | null;
  connectPort?: number; hasPassword?: boolean; carGroup?: string; cars?: string[];
  sessions?: { type: string; minutes: number }[];
}

export default function PublicPage() {
  const [site, setSite] = useState<any>({});
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [selServer, setSelServer] = useState('');

  useEffect(() => {
    api.get('/public/site').then((r) => setSite(r.data)).catch(() => {});
    const load = async () => {
      const { data } = await api.get('/public/servers').catch(() => ({ data: { servers: [] } }));
      setServers(data.servers);
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const params = selServer ? { serverId: selServer } : {};
    api.get('/public/downloads', { params }).then((r) => setDownloads(r.data.items)).catch(() => {});
  }, [selServer]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <Gauge className="text-primary" size={26} />
          <div>
            <h1 className="text-xl font-bold">{site.siteName || 'AssettoMan'}</h1>
            <p className="text-xs text-muted">Racing server community</p>
          </div>
          {site.discordUrl && (
            <a href={site.discordUrl} target="_blank" rel="noreferrer" className="ml-auto text-sm text-muted hover:text-foreground flex items-center gap-1">
              Discord <ExternalLink size={13} />
            </a>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {site.about && <p className="text-sm text-muted">{site.about}</p>}

        <section>
          <h2 className="text-lg font-semibold mb-3">Servers</h2>
          {servers.length === 0 && <Card><div className="text-sm text-muted">No public servers right now.</div></Card>}
          <div className="grid gap-4 md:grid-cols-2">
            {servers.map((s) => (
              <Card key={s.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold flex items-center gap-2">{s.name} {s.hasPassword && <Lock size={13} className="text-muted" />}</div>
                    <div className="text-xs text-muted">{s.game}{s.carGroup && s.carGroup !== 'FreeForAll' ? ` · ${s.carGroup}` : ''}</div>
                  </div>
                  {s.running ? <Badge tone="green">online</Badge> : <Badge tone="red">offline</Badge>}
                </div>
                {s.blurb && <p className="text-sm text-muted mb-2">{s.blurb}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  {s.track && <span className="flex items-center gap-1"><MapPin size={13} />{s.track}</span>}
                  <span className="flex items-center gap-1"><Users size={13} />{s.players != null ? `${s.players}${s.maxPlayers ? `/${s.maxPlayers}` : ''}` : s.running ? 'online' : '—'}</span>
                  {s.connectPort && <span className="text-xs">port {s.connectPort}</span>}
                </div>
                {s.sessions && s.sessions.length > 0 && (
                  <div className="text-xs text-muted mt-2">
                    {s.sessions.map((x) => `${({ P: 'Practice', Q: 'Qualy', R: 'Race' } as any)[x.type] || x.type} ${x.minutes}m`).join(' → ')}
                  </div>
                )}
                {s.cars && s.cars.length > 0 && (
                  <div className="text-xs text-muted mt-2 truncate">Cars: {s.cars.join(', ')}</div>
                )}
              </Card>
            ))}
          </div>
        </section>

        {site.joinInfo && (
          <section>
            <h2 className="text-lg font-semibold mb-3">How to join</h2>
            <Card><p className="text-sm whitespace-pre-wrap">{site.joinInfo}</p></Card>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Downloads</h2>
            {servers.filter((s) => s.type !== 'acc').length > 1 && (
              <select value={selServer} onChange={(e) => setSelServer(e.target.value)} className="bg-card border border-border rounded px-2 py-1 text-xs">
                <option value="">All servers</option>
                {servers.filter((s) => s.type !== 'acc').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
          {downloads.length === 0 ? (
            <Card><div className="text-sm text-muted">No downloads available.</div></Card>
          ) : (
            <div className="space-y-1">
              {downloads.map((d) => (
                <a key={d.id} href={`/api/public/download/${d.id}`} className="flex items-center gap-3 bg-card border border-border rounded px-4 py-2.5 hover:border-primary/60 transition">
                  <Package size={15} className="text-muted" />
                  <span className="flex-1 text-sm">{d.name} {d.version && <span className="text-xs text-muted">v{d.version}</span>}</span>
                  <span className="text-xs text-muted">{d.kind}{d.size ? ` · ${(d.size / 1e6).toFixed(1)} MB` : ''}</span>
                  <Download size={14} className="text-muted" />
                </a>
              ))}
            </div>
          )}
        </section>

        {site.rules && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Server rules</h2>
            <Card><p className="text-sm whitespace-pre-wrap">{site.rules}</p></Card>
          </section>
        )}

        <footer className="text-xs text-muted pt-4 border-t border-border">
          Powered by AssettoMan · <a href="/login" className="hover:text-foreground">staff login</a>
        </footer>
      </main>
    </div>
  );
}
