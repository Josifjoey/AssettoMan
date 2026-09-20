import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, GameServer } from '../api';
import { Card, Badge, Button, Tabs, Input, Field, Check } from '../components/ui';
import { Play, Square, RefreshCw, Box, Trash2, AlertTriangle } from 'lucide-react';
import AccConfigForm from '../components/server/AccConfigForm';
import AcConfigForm from '../components/server/AcConfigForm';
import EntriesEditor from '../components/server/EntriesEditor';
import FileBrowser from '../components/server/FileBrowser';
import LogViewer from '../components/server/LogViewer';
import ModInstaller from '../components/server/ModInstaller';
import LiveView, { LiveSnapshot, TrackMap, fmtMs } from '../components/live/LiveView';

export default function ServerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [server, setServer] = useState<GameServer | null>(null);
  const [tab, setTab] = useState('overview');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/servers/${id}`);
      setServer(data.server);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: string) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.post(`/servers/${id}/${action}`);
      setMsg(`${action} done`);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const saveConfig = async (config: any, ports?: any) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.put(`/servers/${id}/config`, { config, ports });
      setMsg('Configuration saved');
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const del = async () => {
    setBusy(true);
    try {
      await api.delete(`/servers/${id}`);
      nav('/');
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  if (!server) return <div className="text-muted">{err || 'Loading…'}</div>;
  const running = !!server.live?.running;
  const isLocal = server.runtime === 'local';
  const exeMissing = isLocal && server.exePresent === false;
  const canStart = isLocal ? server.exePresent === true : !!server.container_id;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'config', label: 'Configuration' },
    { id: 'entries', label: server.type === 'acc' ? 'Entry List & BoP' : 'Entry List' },
    ...(server.type !== 'acc' ? [{ id: 'live', label: 'Live' }] : []),
    { id: 'results', label: 'Results' },
    ...(server.type === 'ac_modded' || server.type === 'assettoserver' ? [{ id: 'content', label: 'Mod Content' }] : []),
    { id: 'files', label: 'Files' },
    { id: 'logs', label: 'Logs' },
    { id: 'danger', label: 'Danger' },
  ];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to="/" className="text-xs text-muted hover:text-foreground">← Dashboard</Link>
          <h1 className="text-xl font-bold flex items-center gap-3">
            {server.name}
            {running ? <Badge tone="green">running</Badge> : <Badge tone="red">{server.live?.state || 'stopped'}</Badge>}
          </h1>
        </div>
        <div className="flex gap-2">
          {running ? (
            <>
              <Button variant="danger" onClick={() => act('stop')} disabled={busy}><Square size={13} className="inline mr-1" />Stop</Button>
              <Button variant="ghost" onClick={() => act('restart')} disabled={busy}><RefreshCw size={13} className="inline mr-1" />Restart</Button>
            </>
          ) : (
            <>
              <Button variant="success" onClick={() => act('start')} disabled={busy || !canStart}><Play size={13} className="inline mr-1" />Start</Button>
              <Button variant="outline" onClick={() => act('provision')} disabled={busy}><Box size={13} className="inline mr-1" />{isLocal ? 'Verify executable' : (server.container_id ? 'Re-provision' : 'Provision container')}</Button>
            </>
          )}
        </div>
      </div>

      {server.type === 'acc' && !server.accExePresent && (
        <div className="mb-4 flex items-start gap-2 text-amber-300 bg-amber-900/30 border border-amber-800 rounded p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span><code>accServer.exe</code> not found. Download the ACC Dedicated Server tool in Steam, then drop the exe into <code>acc/</code> via the Files tab or your appdata share.</span>
        </div>
      )}
      {exeMissing && server.type !== 'acc' && (
        <div className="mb-4 flex items-start gap-2 text-amber-300 bg-amber-900/30 border border-amber-800 rounded p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span><code>{server.exePath?.split(/[\\/]/).pop() || 'acServer.exe'}</code> not found. Place it plus the game <code>content/</code> folder at <code className="font-mono">{server.exePath?.replace(/[^\\/]+$/, '')}</code></span>
        </div>
      )}
      {running && <div className="mb-4 text-xs text-muted">Server is running — stop it to edit configuration.</div>}
      {err && <div className="mb-3 text-sm text-red-400">{err}</div>}
      {msg && <div className="mb-3 text-sm text-emerald-400">{msg}</div>}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Status">
            <dl className="text-sm space-y-2">
              <Row k="State" v={server.live?.state || 'unknown'} />
              <Row k="Track" v={server.live?.track || '—'} />
              <Row k="Players" v={server.live?.players != null ? `${server.live.players}${server.live.maxPlayers ? ` / ${server.live.maxPlayers}` : ''}` : '—'} />
              <Row k="Runtime" v={isLocal ? 'local process' : 'docker container'} />
              {!isLocal && <Row k="Container" v={server.container_name || '—'} mono />}
              <Row k="Game port" v={String(server.ports.game)} />
              {server.ports.http ? <Row k="HTTP port" v={String(server.ports.http)} /> : null}
              {server.live?.note && <Row k="Note" v={server.live.note} />}
            </dl>
          </Card>
          <Card title="Visibility">
            <div className="space-y-3">
              <Check label="Show on public page" checked={server.is_public} onChange={async (v) => { await api.put(`/servers/${id}/config`, { isPublic: v }); load(); }} hint="Lists this server on /public with live status" />
              <Field label="Public blurb">
                <Input
                  defaultValue={server.public_blurb || ''}
                  onBlur={(e) => api.put(`/servers/${id}/config`, { publicBlurb: e.target.value }).then(load)}
                  placeholder="Casual racing, all skill levels welcome"
                />
              </Field>
            </div>
          </Card>
          <Card title="Connect" className="md:col-span-2">
            <p className="text-sm text-muted">
              Players connect via the server browser (lobby registration {server.type === 'acc' ? (server.config?.settings?.registerToLobby !== 0 && server.config?.configuration?.registerToLobby !== 0 ? 'enabled' : 'disabled') : (server.config?.server?.registerToLobby ? 'enabled' : 'disabled')}) or direct IP on port {server.ports.game} (TCP+UDP).
            </p>
          </Card>
        </div>
      )}

      {tab === 'config' && (
        server.type === 'acc'
          ? <AccConfigForm server={server} disabled={running || busy} onSave={saveConfig} />
          : <AcConfigForm server={server} disabled={running || busy} onSave={saveConfig} />
      )}

      {tab === 'entries' && (
        <EntriesEditor server={server} disabled={running || busy} onSave={saveConfig} />
      )}

      {tab === 'live' && <LiveTab server={server} />}

      {tab === 'results' && <ResultsTab server={server} />}

      {tab === 'content' && <ModInstaller server={server} onChanged={load} />}

      {tab === 'files' && <FileBrowser serverId={server.id} />}

      {tab === 'logs' && <LogViewer serverId={server.id} />}

      {tab === 'danger' && (
        <Card title="Delete server" className="max-w-lg">
          <p className="text-sm text-muted mb-3">Removes the container and (optionally) all server files. This can't be undone.</p>
          {!confirmDelete ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} className="inline mr-1" />Delete server</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="danger" onClick={del} disabled={busy}>Yes, delete everything</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function LiveTab({ server }: { server: GameServer }) {
  const [snap, setSnap] = useState<LiveSnapshot>({ active: false });
  const [trackMap, setTrackMap] = useState<TrackMap | null>(null);
  const [chat, setChat] = useState('');
  const [cmd, setCmd] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const { data } = await api.get(`/servers/${server.id}/telemetry`);
        if (!dead) setSnap(data);
      } catch { /* keep polling */ }
    };
    load();
    const t = setInterval(load, 2000);
    api.get(`/public/track-map/${server.id}`).then((r) => { if (!dead) setTrackMap(r.data); }).catch(() => {});
    return () => { dead = true; clearInterval(t); };
  }, [server.id]);

  const act = async (path: string, body?: any) => {
    try {
      await api.post(`/servers/${server.id}/telemetry/${path}`, body || {});
      setMsg('sent'); setTimeout(() => setMsg(''), 1500);
    } catch (e: any) { setMsg(e.message); }
  };

  const session = snap.session;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-muted">
          {snap.active
            ? <>{session ? `${session.name} · ${session.typeName}` : 'listening'}{session?.track ? ` — ${session.track}${session.trackConfig ? `/${session.trackConfig}` : ''}` : ''}</>
            : 'Telemetry not active — start the server with live telemetry enabled.'}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input className="w-56" placeholder="Broadcast chat…" value={chat} onChange={(e) => setChat(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && chat) { act('chat', { message: chat }); setChat(''); } }} />
          <Button variant="ghost" disabled={!chat} onClick={() => { act('chat', { message: chat }); setChat(''); }}>Send</Button>
          <Button variant="ghost" onClick={() => act('next-session')}>Next session</Button>
          <Button variant="ghost" onClick={() => act('restart-session')}>Restart session</Button>
        </div>
      </div>
      {msg && <div className="text-xs text-muted">{msg}</div>}
      <div className="h-[32rem]">
        <LiveView snap={snap} trackMap={trackMap} onKick={(carId) => { if (confirm(`Kick car ${carId}?`)) act('kick', { carId }); }} />
      </div>
      <div className="flex items-center gap-2">
        <Input className="w-72" placeholder="Admin command (e.g. /ballast 3 20)" value={cmd} onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && cmd) { act('admin', { command: cmd }); setCmd(''); } }} />
        <Button variant="outline" disabled={!cmd} onClick={() => { act('admin', { command: cmd }); setCmd(''); }}>Run admin command</Button>
      </div>
    </div>
  );
}

function ResultsTab({ server }: { server: GameServer }) {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [expandLaps, setExpandLaps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get(`/servers/${server.id}/results`).then((r) => setList(r.data.results)).catch(() => setList([]));
  }, [server.id]);

  const open = async (id: string) => {
    try {
      const { data } = await api.get(`/servers/${server.id}/results/${id}`);
      setSel(data);
      setExpandLaps({});
    } catch { /* ignore */ }
  };

  if (sel) {
    return (
      <div className="space-y-3">
        <button className="text-xs text-muted hover:text-foreground" onClick={() => setSel(null)}>← Back to results</button>
        <Card title={`${sel.type} — ${sel.track || '?'} · ${new Date(sel.date).toLocaleString()}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="px-2 py-1.5 w-8">P</th><th className="px-2 py-1.5">Driver</th><th className="px-2 py-1.5">Car</th>
                <th className="px-2 py-1.5 text-right">Laps</th><th className="px-2 py-1.5 text-right">Best</th>
                <th className="px-2 py-1.5 text-right">Total</th><th className="px-2 py-1.5 text-right">Gap</th><th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {(sel.results || []).map((r: any, i: number) => (
                <React.Fragment key={i}>
                  <tr className="border-b border-border/50">
                    <td className="px-2 py-1.5 font-bold">{r.position}</td>
                    <td className="px-2 py-1.5">{r.driverName || '—'}{r.team ? <span className="text-muted"> · {r.team}</span> : ''}</td>
                    <td className="px-2 py-1.5 text-muted">{r.carModel || '—'}{r.raceNumber ? ` #${r.raceNumber}` : ''}</td>
                    <td className="px-2 py-1.5 text-right">{r.lapCount}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmtMs(r.bestLapMs)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{fmtMs(r.totalTimeMs)}</td>
                    <td className="px-2 py-1.5 text-right text-muted">{r.gapMs != null ? `+${fmtMs(r.gapMs)}` : ''}</td>
                    <td className="px-2 py-1.5">
                      <button className="text-[10px] text-primary hover:underline" onClick={() => setExpandLaps((m) => ({ ...m, [r.driverName]: !m[r.driverName] }))}>
                        {expandLaps[r.driverName] ? 'hide laps' : 'laps'}
                      </button>
                    </td>
                  </tr>
                  {expandLaps[r.driverName] && (
                    <tr><td colSpan={8} className="px-4 py-2 bg-background">
                      <div className="grid grid-cols-4 md:grid-cols-6 gap-1 font-mono text-[11px]">
                        {(sel.laps || []).filter((l: any) => l.driverName === r.driverName).map((l: any, j: number) => (
                          <span key={j} className={l.valid ? '' : 'text-red-400 line-through'}>{fmtMs(l.lapTimeMs)}{l.cuts ? ` (${l.cuts}x)` : ''}</span>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  return (
    <Card title={`Session results (${list.length})`}>
      {list.length === 0 && <div className="text-sm text-muted">No result files yet — they appear after sessions end.</div>}
      <div className="space-y-1">
        {list.map((r) => (
          <button key={r.id} onClick={() => open(r.id)} className="w-full flex items-center gap-3 bg-background border border-border rounded px-3 py-2 text-sm hover:border-primary/60 text-left">
            <Badge tone={r.type === 'race' ? 'red' : r.type === 'qualify' ? 'blue' : 'neutral'}>{r.type}</Badge>
            <span className="flex-1 truncate">{r.track || '?'}</span>
            <span className="text-xs text-muted">{new Date(r.date).toLocaleString()}</span>
            <span className="text-xs text-muted">{r.driverCount} drivers{r.winner ? ` · 🏆 ${r.winner}` : ''}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className={mono ? 'font-mono text-xs' : ''}>{v}</dd>
    </div>
  );
}
