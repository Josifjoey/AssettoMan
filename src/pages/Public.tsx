import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Card, Badge } from '../components/ui';
import { Gauge, MapPin, Users, Download, Package, Lock, ExternalLink, Copy, PlayCircle, Radio } from 'lucide-react';

// Community-facing page — no login required. Shows live server status,
// rules and mod downloads.

interface CarMeta { id: string; name: string; brand?: string | null; previewUrl?: string }
interface TrackMeta { id: string; layout?: string | null; name: string; previewUrl?: string; outlineUrl?: string }
interface PublicServer {
  id: string; name: string; type: string; game: string; blurb: string;
  running: boolean; track?: string; players?: number | null; maxPlayers?: number | null;
  connectPort?: number; httpPort?: number; hasPassword?: boolean; carGroup?: string; cars?: string[];
  carsMeta?: CarMeta[]; trackMeta?: TrackMeta; joinUrl?: string;
  liveAvailable?: boolean; liveUrl?: string;
  sessions?: { type: string; minutes: number }[];
}

function domainOf(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
}

export default function PublicPage() {
  const [site, setSite] = useState<any>({});
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [selServer, setSelServer] = useState('');
  const [copied, setCopied] = useState('');

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

  const copyConnect = (s: PublicServer) => {
    if (!site.gameHost || !s.connectPort) return;
    navigator.clipboard?.writeText(`${site.gameHost}:${s.connectPort}`).catch(() => {});
    setCopied(s.id);
    setTimeout(() => setCopied(''), 1500);
  };

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
              <Card key={s.id} className="overflow-hidden p-0">
                {s.trackMeta?.previewUrl && (
                  <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url(${s.trackMeta.previewUrl})` }} />
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold flex items-center gap-2">{s.name} {s.hasPassword && <Lock size={13} className="text-muted" />}</div>
                      <div className="text-xs text-muted">{s.game}{s.carGroup && s.carGroup !== 'FreeForAll' ? ` · ${s.carGroup}` : ''}</div>
                    </div>
                    {s.running ? <Badge tone="green">online</Badge> : <Badge tone="red">offline</Badge>}
                  </div>
                  {s.blurb && <p className="text-sm text-muted mb-2">{s.blurb}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    {(s.trackMeta?.name || s.track) && <span className="flex items-center gap-1"><MapPin size={13} />{s.trackMeta?.name || s.track}</span>}
                    <span className="flex items-center gap-1"><Users size={13} />{s.players != null ? `${s.players}${s.maxPlayers ? `/${s.maxPlayers}` : ''}` : s.running ? 'online' : '—'}</span>
                    {site.gameHost && s.connectPort && (
                      <button onClick={() => copyConnect(s)} className="text-xs flex items-center gap-1 hover:text-foreground" title="Copy address">
                        <Copy size={11} />{copied === s.id ? 'copied!' : `${site.gameHost}:${s.connectPort}`}
                      </button>
                    )}
                  </div>
                  {s.sessions && s.sessions.length > 0 && (
                    <div className="text-xs text-muted mt-2">
                      {s.sessions.map((x) => `${({ P: 'Practice', Q: 'Qualy', R: 'Race' } as any)[x.type] || x.type} ${x.minutes}m`).join(' → ')}
                    </div>
                  )}
                  {s.carsMeta && s.carsMeta.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {s.carsMeta.map((c) => (
                        <span key={c.id} className="flex items-center gap-1.5 bg-background border border-border rounded px-1.5 py-1 text-xs" title={c.id}>
                          <img src={c.previewUrl} alt="" className="w-10 h-6 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          <span className="truncate max-w-[10rem]">{c.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {s.joinUrl && (
                      <a href={s.joinUrl} className="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded text-xs font-medium hover:brightness-110">
                        <PlayCircle size={13} /> Join in Content Manager
                      </a>
                    )}
                    {s.liveAvailable && s.liveUrl && (
                      <Link to={s.liveUrl} className="inline-flex items-center gap-1.5 bg-accent text-foreground px-3 py-1.5 rounded text-xs font-medium hover:bg-border">
                        <Radio size={13} className="text-red-400" /> Watch live
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <div className="text-xs text-muted mt-3">
            Join buttons need <a href="https://acstuff.club/app/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Content Manager</a>.
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
              {downloads.map((d) => {
                const external = d.source_type === 'external' && d.external_url;
                const inner = (
                  <>
                    {d.preview_image
                      ? <img src={d.preview_image} alt="" className="w-14 h-9 object-cover rounded shrink-0" />
                      : <Package size={15} className="text-muted shrink-0" />}
                    <span className="flex-1 text-sm min-w-0">
                      <span className="block truncate">{d.name} {d.version && <span className="text-xs text-muted">v{d.version}</span>}</span>
                      {d.description && <span className="block text-xs text-muted truncate">{d.description}</span>}
                    </span>
                    <span className="text-xs text-muted">{d.kind}{!external && d.size ? ` · ${(d.size / 1e6).toFixed(1)} MB` : ''}</span>
                    {external
                      ? <span className="text-xs text-primary flex items-center gap-1">Get from {domainOf(d.external_url)} <ExternalLink size={12} /></span>
                      : <Download size={14} className="text-muted" />}
                  </>
                );
                return external ? (
                  <a key={d.id} href={d.external_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-card border border-border rounded px-4 py-2.5 hover:border-primary/60 transition">{inner}</a>
                ) : (
                  <a key={d.id} href={`/api/public/download/${d.id}`} className="flex items-center gap-3 bg-card border border-border rounded px-4 py-2.5 hover:border-primary/60 transition">{inner}</a>
                );
              })}
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
