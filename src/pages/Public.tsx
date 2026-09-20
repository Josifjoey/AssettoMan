import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge } from '../components/ui';
import { fmtMs } from '../components/live/LiveView';
import { useAuth } from '../auth';
import {
  Gauge, MapPin, Users, Download, Package, Lock, ExternalLink, Copy,
  PlayCircle, Radio, Trophy, ChevronDown, ChevronUp, Search, Flag,
} from 'lucide-react';

// Community-facing landing page — no login required.

interface CarMeta { id: string; name: string; brand?: string | null; previewUrl?: string }
interface TrackMeta { id: string; layout?: string | null; name: string; previewUrl?: string; outlineUrl?: string }
interface PublicServer {
  id: string; name: string; type: string; game: string; blurb: string;
  running: boolean; track?: string; players?: number | null; maxPlayers?: number | null;
  connectPort?: number; httpPort?: number; hasPassword?: boolean; carGroup?: string; cars?: string[];
  sessionType?: string; sessionPhase?: string;
  carsMeta?: CarMeta[]; trackMeta?: TrackMeta; joinUrl?: string;
  liveAvailable?: boolean; liveUrl?: string;
  sessions?: { type: string; minutes: number }[];
}

const GAME_BADGE: Record<string, string> = {
  ac: 'AC', ac_modded: 'AC Modded', assettoserver: 'AssettoServer', acc: 'ACC',
};
const SESSION_LABEL: Record<string, string> = { P: 'Practice', Q: 'Qualy', R: 'Race' };
const KIND_FILTERS = ['all', 'car', 'track', 'other'];

function domainOf(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
}

export default function PublicPage() {
  const { user, setupRequired } = useAuth();
  const [site, setSite] = useState<any>({});
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [downloads, setDownloads] = useState<any[]>([]);
  const [copied, setCopied] = useState('');
  const [scrolled, setScrolled] = useState(false);
  // downloads toolbar
  const [selServer, setSelServer] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [search, setSearch] = useState('');
  // results
  const [resultsServer, setResultsServer] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [openFile, setOpenFile] = useState('');
  const [openResult, setOpenResult] = useState<any>(null);
  const [carsExpanded, setCarsExpanded] = useState<Record<string, boolean>>({});

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
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const params = selServer ? { serverId: selServer } : {};
    api.get('/public/downloads', { params }).then((r) => setDownloads(r.data.items)).catch(() => {});
  }, [selServer]);

  useEffect(() => {
    if (!resultsServer && servers.length) setResultsServer(servers[0].id);
  }, [servers]);

  useEffect(() => {
    if (!resultsServer) return;
    setOpenFile(''); setOpenResult(null);
    api.get(`/public/results/${resultsServer}`).then((r) => setResults(r.data.results)).catch(() => setResults([]));
    api.get(`/public/leaderboard/${resultsServer}`).then((r) => setLeaderboard(r.data.entries)).catch(() => setLeaderboard([]));
  }, [resultsServer]);

  const openSession = (file: string) => {
    if (openFile === file) { setOpenFile(''); setOpenResult(null); return; }
    setOpenFile(file); setOpenResult(null);
    api.get(`/public/results/${resultsServer}/${encodeURIComponent(file)}`)
      .then((r) => setOpenResult(r.data.result ?? r.data)).catch(() => setOpenResult({ error: true }));
  };

  const copyConnect = (s: PublicServer) => {
    if (!site.gameHost || !s.connectPort) return;
    navigator.clipboard?.writeText(`${site.gameHost}:${s.connectPort}`).catch(() => {});
    setCopied(s.id);
    setTimeout(() => setCopied(''), 1500);
  };

  const online = servers.filter((s) => s.running);
  const driversOnTrack = online.reduce((n, s) => n + (s.players ?? 0), 0);
  const hasDownloads = downloads.length > 0 || servers.some((s) => s.type !== 'acc');
  const hasResults = servers.length > 0;
  const filteredDownloads = downloads.filter((d) => {
    if (kindFilter !== 'all' && (d.kind || 'other') !== kindFilter) return false;
    if (search && !`${d.name} ${d.description ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const navItem = 'text-sm text-muted hover:text-foreground transition';
  const sections = [
    ['servers', 'Servers', servers.length > 0],
    ['downloads', 'Downloads', hasDownloads],
    ['results', 'Results', hasResults],
    ['rules', 'Rules', !!site.rules],
    ['join', 'How to join', !!site.joinInfo],
  ].filter((x) => x[2]) as [string, string, boolean][];

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky nav */}
      <header className={`sticky top-0 z-40 border-b border-border/60 transition-colors ${scrolled ? 'bg-background/85 backdrop-blur' : 'bg-background/40 backdrop-blur-sm'}`}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <Gauge className="text-primary" size={22} />
          <span className="font-bold">{site.siteName || 'AssettoMan'}</span>
          <nav className="hidden md:flex items-center gap-5 ml-8">
            {sections.map(([id, label]) => <a key={id} href={`#${id}`} className={navItem}>{label}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {site.discordUrl && (
              <a href={site.discordUrl} target="_blank" rel="noreferrer"
                 className="hidden sm:inline-flex items-center gap-1.5 bg-[#5865F2]/90 text-white px-3 py-1.5 rounded text-xs font-medium hover:brightness-110">
                Discord <ExternalLink size={12} />
              </a>
            )}
            {user
              ? <Link to="/admin" className="text-sm text-primary hover:underline">Dashboard</Link>
              : <Link to="/login" className="text-sm text-muted hover:text-foreground">Staff login</Link>}
          </div>
        </div>
      </header>

      {/* Setup banner */}
      {setupRequired && (
        <div className="bg-primary/15 border-b border-primary/40">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3 text-sm">
            <Flag size={16} className="text-primary shrink-0" />
            <span>AssettoMan isn't set up yet — create the admin account to get started.</span>
            <Link to="/setup" className="ml-auto shrink-0 bg-primary text-white px-3 py-1.5 rounded text-xs font-medium hover:brightness-110">Set up now</Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="hero-band border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{site.siteName || 'AssettoMan'}</h1>
          {site.about && <p className="mt-4 max-w-2xl text-muted whitespace-pre-line">{site.about}</p>}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${online.length ? 'bg-green-500 animate-pulse' : 'bg-muted'}`} />
              {online.length} server{online.length === 1 ? '' : 's'} online
            </span>
            <span className="flex items-center gap-2 text-muted"><Users size={14} />{driversOnTrack} driver{driversOnTrack === 1 ? '' : 's'} on track</span>
            {online.some((s) => s.liveAvailable) && (
              <span className="flex items-center gap-1.5 text-red-400"><Radio size={14} /> live timing available</span>
            )}
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-12 space-y-14">
        {/* Servers */}
        <section id="servers" className="scroll-mt-20">
          <h2 className="text-2xl font-bold mb-5">Servers</h2>
          {servers.length === 0 && <div className="text-sm text-muted">No public servers right now.</div>}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((s) => {
              const expanded = carsExpanded[s.id];
              const cars = s.carsMeta ?? [];
              const shownCars = expanded ? cars : cars.slice(0, 6);
              return (
                <div key={s.id} className="bg-card border border-border rounded-lg overflow-hidden flex flex-col hover:border-border/80 transition">
                  <div className="relative h-40 bg-accent">
                    <div className="absolute inset-0 hero-band" />
                    {s.trackMeta?.previewUrl && (
                      <img src={s.trackMeta.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
                    <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-xs font-semibold px-2 py-1 rounded">{GAME_BADGE[s.type] || s.type}</span>
                    <div className="absolute top-3 right-3 flex items-center gap-2">
                      {s.liveAvailable && s.running && (
                        <Link to={s.liveUrl || '#'} className="bg-red-600 text-white text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1">
                          <Radio size={11} /> LIVE
                        </Link>
                      )}
                      <span className="bg-black/60 backdrop-blur-sm text-xs px-2 py-1 rounded flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${s.running ? 'bg-green-500 animate-pulse' : 'bg-muted'}`} />
                        {s.running ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="font-semibold text-white drop-shadow flex items-center gap-1.5">
                        {s.name} {s.hasPassword && <Lock size={13} className="text-white/70" />}
                      </div>
                      {(s.trackMeta?.name || s.track) && (
                        <div className="text-xs text-white/80 flex items-center gap-1 mt-0.5">
                          <MapPin size={11} />{s.trackMeta?.name || s.track}{s.trackMeta?.layout ? ` — ${s.trackMeta.layout}` : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 flex flex-col gap-3 flex-1">
                    {s.blurb && <p className="text-sm text-muted">{s.blurb}</p>}

                    {/* players bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted mb-1">
                        <span className="flex items-center gap-1"><Users size={12} />Drivers</span>
                        <span>{s.players != null ? `${s.players}${s.maxPlayers ? ` / ${s.maxPlayers}` : ''}` : s.running ? '—' : 'offline'}</span>
                      </div>
                      {s.players != null && s.maxPlayers ? (
                        <div className="h-1 bg-background rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (s.players / s.maxPlayers) * 100)}%` }} />
                        </div>
                      ) : null}
                    </div>

                    {/* session line */}
                    {s.type === 'acc' && s.sessionType && (
                      <div className="text-xs text-muted">{s.sessionType}{s.sessionPhase ? ` · ${s.sessionPhase}` : ''}</div>
                    )}
                    {s.sessions && s.sessions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.sessions.map((x, i) => (
                          <span key={i} className="bg-background border border-border rounded px-2 py-0.5 text-[11px] text-muted">
                            {SESSION_LABEL[x.type] || x.type} {x.minutes}m
                          </span>
                        ))}
                      </div>
                    )}

                    {/* cars */}
                    {cars.length > 0 && (
                      <div>
                        <div className="flex flex-wrap gap-2">
                          {shownCars.map((c) => (
                            <span key={c.id} className="flex items-center gap-1.5 bg-background border border-border rounded px-1.5 py-1 text-xs" title={c.id}>
                              <img src={c.previewUrl} alt={c.name} className="w-10 h-6 object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              <span className="truncate max-w-[9rem]">{c.name}</span>
                            </span>
                          ))}
                          {cars.length > 6 && (
                            <button onClick={() => setCarsExpanded({ ...carsExpanded, [s.id]: !expanded })}
                                    className="text-xs text-primary hover:underline px-1">
                              {expanded ? 'show less' : `+${cars.length - 6} more`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* actions */}
                    <div className="flex items-center gap-2 flex-wrap mt-auto pt-1">
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
                      <a href="#results" onClick={() => setResultsServer(s.id)}
                         className="inline-flex items-center gap-1.5 bg-accent text-foreground px-3 py-1.5 rounded text-xs font-medium hover:bg-border">
                        <Trophy size={13} /> Results
                      </a>
                      {site.gameHost && s.connectPort && (
                        <button onClick={() => copyConnect(s)} title="Copy server address"
                                className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground border border-border rounded px-2 py-1.5">
                          <Copy size={11} />{copied === s.id ? 'Copied!' : `${site.gameHost}:${s.connectPort}`}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {servers.length > 0 && (
            <div className="text-xs text-muted mt-4">
              Join buttons need <a href="https://acstuff.club/app/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Content Manager</a>.
            </div>
          )}
        </section>

        {/* Downloads */}
        {hasDownloads && (
          <section id="downloads" className="scroll-mt-20">
            <h2 className="text-2xl font-bold mb-5">Downloads</h2>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex gap-1.5">
                {KIND_FILTERS.map((k) => (
                  <button key={k} onClick={() => setKindFilter(k)}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition ${kindFilter === k ? 'bg-primary text-white border-primary' : 'border-border text-muted hover:text-foreground'}`}>
                    {k === 'all' ? 'All' : k === 'car' ? 'Cars' : k === 'track' ? 'Tracks' : 'Other'}
                  </button>
                ))}
              </div>
              {servers.filter((s) => s.type !== 'acc').length > 1 && (
                <select value={selServer} onChange={(e) => setSelServer(e.target.value)} className="bg-card border border-border rounded px-2 py-1.5 text-xs">
                  <option value="">All servers</option>
                  {servers.filter((s) => s.type !== 'acc').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <div className="relative ml-auto">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search downloads…"
                       className="bg-card border border-border rounded pl-8 pr-3 py-1.5 text-xs w-52 focus:outline-none focus:border-primary/60" />
              </div>
            </div>
            {filteredDownloads.length === 0 ? (
              <div className="text-sm text-muted">No downloads match.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDownloads.map((d) => {
                  const external = d.source_type === 'external' && d.external_url;
                  const href = external ? d.external_url : `/api/public/download/${d.id}`;
                  const domain = domainOf(d.external_url);
                  return (
                    <a key={d.id} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                       className="bg-card border border-border rounded-lg p-4 flex gap-3 hover:border-primary/60 transition">
                      {d.preview_image
                        ? <img src={d.preview_image} alt={d.name} className="w-16 h-11 object-cover rounded shrink-0" />
                        : <div className="w-16 h-11 rounded bg-accent grid place-items-center shrink-0"><Package size={16} className="text-muted" /></div>}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{d.name} {d.version && <span className="text-xs text-muted">v{d.version}</span>}</div>
                        {d.description && <div className="text-xs text-muted truncate mt-0.5">{d.description}</div>}
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted">
                          <span className="bg-background border border-border rounded px-1.5 py-0.5">{d.kind}</span>
                          <span className="bg-background border border-border rounded px-1.5 py-0.5">{external ? domain : 'Hosted'}</span>
                          {!external && d.size ? <span>{(d.size / 1e6).toFixed(1)} MB</span> : null}
                        </div>
                        <div className="text-xs text-primary mt-1.5 flex items-center gap-1">
                          {external ? <>Get from {domain} <ExternalLink size={11} /></> : <><Download size={11} /> Download</>}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Results */}
        {hasResults && (
          <section id="results" className="scroll-mt-20">
            <h2 className="text-2xl font-bold mb-5">Results</h2>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {servers.map((s) => (
                <button key={s.id} onClick={() => setResultsServer(s.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition ${resultsServer === s.id ? 'bg-primary text-white border-primary' : 'border-border text-muted hover:text-foreground'}`}>
                  {s.name}
                </button>
              ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-muted mb-2">Recent sessions</h3>
                {results.length === 0 && <div className="text-sm text-muted">No results yet.</div>}
                <div className="space-y-1.5">
                  {results.map((r) => (
                    <div key={r.id} className="bg-card border border-border rounded overflow-hidden">
                      <button onClick={() => openSession(r.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-accent/50">
                        <Badge tone={r.type === 'race' ? 'red' : r.type === 'qualify' ? 'blue' : 'neutral'}>{r.type}</Badge>
                        <span className="flex-1 truncate">{r.track || '?'}</span>
                        <span className="text-xs text-muted hidden sm:inline">{new Date(r.date).toLocaleString()}</span>
                        <span className="text-xs text-muted">{r.driverCount} drivers{r.winner ? ` · ${r.winner}` : ''}</span>
                        {openFile === r.id ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
                      </button>
                      {openFile === r.id && (
                        <div className="border-t border-border px-3 py-2">
                          {!openResult && <div className="text-xs text-muted py-2">Loading…</div>}
                          {openResult?.error && <div className="text-xs text-muted py-2">Couldn't load this result.</div>}
                          {openResult && !openResult.error && (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted border-b border-border">
                                  <th className="py-1 pr-2">Pos</th><th className="py-1 pr-2">Driver</th><th className="py-1 pr-2">Car</th>
                                  <th className="py-1 pr-2 text-right">Laps</th><th className="py-1 pr-2 text-right">Best</th>
                                  <th className="py-1 pr-2 text-right">Total</th><th className="py-1 text-right">Gap</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(openResult.results || []).map((row: any, i: number) => (
                                  <tr key={i} className="border-b border-border/40 last:border-0">
                                    <td className="py-1.5 pr-2">{row.position}</td>
                                    <td className="py-1.5 pr-2">{row.driverName}</td>
                                    <td className="py-1.5 pr-2 text-muted">{row.carModel}</td>
                                    <td className="py-1.5 pr-2 text-right">{row.lapCount ?? '—'}</td>
                                    <td className="py-1.5 pr-2 text-right font-mono">{fmtMs(row.bestLapMs)}</td>
                                    <td className="py-1.5 pr-2 text-right font-mono">{fmtMs(row.totalTimeMs)}</td>
                                    <td className="py-1.5 text-right font-mono text-muted">{row.gapMs != null ? `+${fmtMs(row.gapMs)}` : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted mb-2">Best laps</h3>
                {leaderboard.length === 0 ? <div className="text-sm text-muted">No lap records yet.</div> : (
                  <div className="bg-card border border-border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted border-b border-border bg-accent/40">
                          <th className="px-3 py-2">Track</th><th className="px-3 py-2">Car</th><th className="px-3 py-2">Driver</th>
                          <th className="px-3 py-2 text-right">Best lap</th><th className="px-3 py-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((e, i) => (
                          <tr key={i} className="border-b border-border/40 last:border-0">
                            <td className="px-3 py-2">{e.track}</td>
                            <td className="px-3 py-2 text-muted">{e.carModel}</td>
                            <td className="px-3 py-2">{e.driverName}</td>
                            <td className="px-3 py-2 text-right font-mono">{fmtMs(e.bestLapMs)}</td>
                            <td className="px-3 py-2 text-right text-muted">{new Date(e.date).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Rules + join */}
        {(site.rules || site.joinInfo) && (
          <div className="grid gap-8 md:grid-cols-2">
            {site.rules && (
              <section id="rules" className="scroll-mt-20">
                <h2 className="text-2xl font-bold mb-4">Rules</h2>
                <p className="text-sm text-muted whitespace-pre-line">{site.rules}</p>
              </section>
            )}
            {site.joinInfo && (
              <section id="join" className="scroll-mt-20">
                <h2 className="text-2xl font-bold mb-4">How to join</h2>
                <p className="text-sm text-muted whitespace-pre-line">{site.joinInfo}</p>
              </section>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border/60 mt-8">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-muted">
          <span className="font-semibold text-foreground">{site.siteName || 'AssettoMan'}</span>
          <a href="https://github.com/Josifjoey/AssettoMan" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Powered by AssettoMan</a>
          <a href="https://acstuff.club/app/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Content Manager</a>
          <Link to="/login" className="ml-auto hover:text-foreground">Staff login</Link>
        </div>
      </footer>
    </div>
  );
}
